"""
Generate synthetic training data for seniority classifier and NER model.

Expands the seed datasets in ml/data/ using an LLM (OpenAI by default).
Deduplicates against existing examples before appending.

Usage:
    python -m ml.scripts.generate_dataset --task seniority --n 150
    python -m ml.scripts.generate_dataset --task ner --n 100
    python -m ml.scripts.generate_dataset --task seniority --n 50 --label junior
"""

from __future__ import annotations

import argparse
import json
import logging
import random
import sys
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

DATA_DIR = Path(__file__).parent.parent / "data"
SENIORITY_FILE = DATA_DIR / "seniority_dataset.jsonl"
NER_FILE = DATA_DIR / "ner_dataset.jsonl"

_DOMAINS = [
    "Python backend", "Node.js backend", "Go backend", "Java backend",
    "React frontend", "Vue.js frontend", "Angular frontend",
    "ML/AI engineer", "Data Scientist", "Data Engineer",
    "DevOps/SRE", "Android (Kotlin)", "iOS (Swift)", "Full-stack",
    "QA Automation", "Data Analyst", "Embedded C++",
]

_SENIORITY_PROMPTS = {
    "junior": (
        "Write a SHORT resume snippet (2-4 lines) for a JUNIOR software engineer "
        "in the domain: {domain}. "
        "Include signals: 0-2 years experience, learning/studying keywords, "
        "tutorial/university/pet projects, basic or limited skills, "
        "needs guidance. Mix Russian and English naturally. "
        "Return only the resume text, no labels or explanation."
    ),
    "middle": (
        "Write a SHORT resume snippet (2-4 lines) for a MIDDLE software engineer "
        "in the domain: {domain}. "
        "Include signals: 3-4 years commercial experience, independent work, "
        "code reviews, real production projects, team collaboration. "
        "Mix Russian and English naturally. "
        "Return only the resume text, no labels or explanation."
    ),
    "senior": (
        "Write a SHORT resume snippet (2-4 lines) for a SENIOR software engineer "
        "in the domain: {domain}. "
        "Include signals: 5+ years experience, architecture decisions, "
        "team/tech leadership, mentoring, high-load/large-scale systems. "
        "Mix Russian and English naturally. "
        "Return only the resume text, no labels or explanation."
    ),
}

_NER_PROMPT = (
    "Generate a SHORT sentence fragment (5-12 tokens) from a resume or job vacancy "
    "that mentions 2-4 technical skills. Use realistic tech terms (frameworks, languages, tools). "
    "Mix Russian context words with English tech terms. "
    "Then return a JSON object with two fields: "
    '"tokens" (list of individual tokens) and "labels" (BIO tags: B-SKILL for skill start, '
    "I-SKILL for continuation, O for non-skill). "
    "Example: {\"tokens\": [\"Python\", \",\", \"FastAPI\", \",\", \"Redis\"], "
    "\"labels\": [\"B-SKILL\", \"O\", \"B-SKILL\", \"O\", \"B-SKILL\"]}. "
    "Return only the JSON object."
)


def _load_existing(path: Path) -> list[dict]:
    if not path.exists():
        return []
    with path.open(encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]


def _get_client():
    try:
        from openai import OpenAI
        return OpenAI()
    except ImportError:
        logger.error("openai package not installed: pip install openai")
        sys.exit(1)


def _call_llm(client, prompt: str) -> str:
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.9,
        max_tokens=200,
    )
    return response.choices[0].message.content.strip()


def generate_seniority(n: int, label: str | None = None) -> None:
    client = _get_client()
    existing = _load_existing(SENIORITY_FILE)
    existing_texts = {e["text"] for e in existing}

    labels = [label] if label else ["junior", "middle", "senior"]
    per_label = n // len(labels) if not label else n
    new_examples: list[dict] = []

    for lbl in labels:
        generated = 0
        attempts = 0
        while generated < per_label and attempts < per_label * 3:
            attempts += 1
            domain = random.choice(_DOMAINS)
            prompt = _SENIORITY_PROMPTS[lbl].format(domain=domain)
            try:
                text = _call_llm(client, prompt)
                text = text.strip().strip('"')
                if text and text not in existing_texts and len(text) > 20:
                    new_examples.append({"text": text, "label": lbl})
                    existing_texts.add(text)
                    generated += 1
                    if generated % 10 == 0:
                        logger.info("  %s: %d/%d generated", lbl, generated, per_label)
            except Exception as exc:
                logger.warning("LLM call failed: %s", exc)

        logger.info("Generated %d %s examples", generated, lbl)

    if not new_examples:
        logger.warning("No new examples generated")
        return

    with SENIORITY_FILE.open("a", encoding="utf-8") as f:
        for ex in new_examples:
            f.write(json.dumps(ex, ensure_ascii=False) + "\n")

    logger.info("Appended %d examples to %s (total: %d)", len(new_examples), SENIORITY_FILE, len(existing) + len(new_examples))


def generate_ner(n: int) -> None:
    client = _get_client()
    existing = _load_existing(NER_FILE)
    existing_keys = {tuple(e["tokens"]) for e in existing}

    new_examples: list[dict] = []
    attempts = 0

    while len(new_examples) < n and attempts < n * 4:
        attempts += 1
        try:
            raw = _call_llm(client, _NER_PROMPT)
            raw = raw.strip()
            if raw.startswith("```"):
                raw = raw.split("```")[1].lstrip("json").strip()
            ex = json.loads(raw)
            if (
                isinstance(ex, dict)
                and "tokens" in ex
                and "labels" in ex
                and len(ex["tokens"]) == len(ex["labels"])
                and len(ex["tokens"]) >= 3
                and tuple(ex["tokens"]) not in existing_keys
            ):
                new_examples.append(ex)
                existing_keys.add(tuple(ex["tokens"]))
                if len(new_examples) % 10 == 0:
                    logger.info("  NER: %d/%d generated", len(new_examples), n)
        except (json.JSONDecodeError, KeyError) as exc:
            logger.debug("Parse failed: %s", exc)
        except Exception as exc:
            logger.warning("LLM call failed: %s", exc)

    if not new_examples:
        logger.warning("No new NER examples generated")
        return

    with NER_FILE.open("a", encoding="utf-8") as f:
        for ex in new_examples:
            f.write(json.dumps(ex, ensure_ascii=False) + "\n")

    logger.info("Appended %d examples to %s (total: %d)", len(new_examples), NER_FILE, len(existing) + len(new_examples))


def stats() -> None:
    for path, name in [(SENIORITY_FILE, "seniority"), (NER_FILE, "ner")]:
        examples = _load_existing(path)
        if name == "seniority":
            counts = {}
            for e in examples:
                counts[e["label"]] = counts.get(e["label"], 0) + 1
            logger.info("%s: %d total — %s", name, len(examples), counts)
        else:
            logger.info("%s: %d total", name, len(examples))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate training data via LLM")
    parser.add_argument("--task", choices=["seniority", "ner", "stats"], required=True)
    parser.add_argument("--n", type=int, default=50, help="Number of examples to generate")
    parser.add_argument("--label", choices=["junior", "middle", "senior"], help="Only generate one class (seniority task)")
    args = parser.parse_args()

    if args.task == "seniority":
        generate_seniority(args.n, args.label)
    elif args.task == "ner":
        generate_ner(args.n)
    elif args.task == "stats":
        stats()
