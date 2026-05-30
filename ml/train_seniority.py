"""Fine-tune distilbert-base-multilingual-cased + LoRA for seniority classification.

LoRA freezes 99%+ of base model weights, trains only small rank-16 adapter matrices.
This prevents overfitting on the small dataset (90 examples) and trains in seconds.

Dataset: ml/data/seniority_dataset.jsonl (90 examples, 30×junior/middle/senior)
Model:   ml/models/seniority/   (LoRA merged into base for clean inference)
Run:     python -m ml.train_seniority
"""
import json
import random
from pathlib import Path

import numpy as np
from transformers import (
    AutoTokenizer,
    AutoModelForSequenceClassification,
    TrainingArguments,
    Trainer,
    DataCollatorWithPadding,
)
from peft import LoraConfig, get_peft_model, TaskType
from datasets import Dataset

LABEL2ID = {"junior": 0, "middle": 1, "senior": 2}
ID2LABEL = {v: k for k, v in LABEL2ID.items()}
BASE_MODEL = "distilbert-base-multilingual-cased"
DATA_PATH = Path("ml/data/seniority_dataset.jsonl")
OUTPUT_DIR = Path("ml/models/seniority")
MAX_LEN = 256


def _load_examples() -> list[dict]:
    with open(DATA_PATH) as f:
        return [json.loads(line) for line in f]


def _compute_metrics(p) -> dict:
    predictions, labels = p
    predictions = np.argmax(predictions, axis=1)
    accuracy = (predictions == labels).mean()
    per_class = {}
    for label_id, label_name in ID2LABEL.items():
        mask = labels == label_id
        if mask.sum() > 0:
            per_class[f"acc_{label_name}"] = round(float((predictions[mask] == labels[mask]).mean()), 4)
    return {"accuracy": round(float(accuracy), 4), **per_class}


def main() -> None:
    random.seed(42)
    examples = _load_examples()
    random.shuffle(examples)

    split = int(len(examples) * 0.85)
    train_raw, eval_raw = examples[:split], examples[split:]
    print(f"Dataset: {len(examples)} total | Train: {len(train_raw)} | Eval: {len(eval_raw)}")

    tokenizer = AutoTokenizer.from_pretrained(BASE_MODEL)
    base_model = AutoModelForSequenceClassification.from_pretrained(
        BASE_MODEL,
        num_labels=len(LABEL2ID),
        id2label=ID2LABEL,
        label2id=LABEL2ID,
    )

    lora_config = LoraConfig(
        task_type=TaskType.SEQ_CLS,
        r=16,
        lora_alpha=32,
        target_modules=["q_lin", "v_lin"],   # DistilBERT attention projections
        lora_dropout=0.1,
        bias="none",
    )
    model = get_peft_model(base_model, lora_config)
    model.print_trainable_parameters()

    def tokenize(batch: dict) -> dict:
        return tokenizer(batch["text"], truncation=True, max_length=MAX_LEN)

    def to_dataset(rows: list[dict]) -> Dataset:
        ds = Dataset.from_list([
            {"text": r["text"], "label": LABEL2ID[r["label"]]} for r in rows
        ])
        return ds.map(tokenize, batched=True, remove_columns=["text"])

    train_ds = to_dataset(train_raw)
    eval_ds = to_dataset(eval_raw)

    args = TrainingArguments(
        output_dir=str(OUTPUT_DIR),
        num_train_epochs=20,
        per_device_train_batch_size=8,
        per_device_eval_batch_size=8,
        learning_rate=2e-4,          # higher LR is standard for LoRA adapters
        weight_decay=0.1,
        eval_strategy="epoch",
        save_strategy="epoch",
        save_total_limit=2,
        load_best_model_at_end=True,
        metric_for_best_model="accuracy",
        greater_is_better=True,
        logging_steps=10,
        report_to="none",
        seed=42,
    )

    trainer = Trainer(
        model=model,
        args=args,
        train_dataset=train_ds,
        eval_dataset=eval_ds,
        tokenizer=tokenizer,
        data_collator=DataCollatorWithPadding(tokenizer),
        compute_metrics=_compute_metrics,
    )

    trainer.train()

    # Merge LoRA adapter weights into the base model for clean inference —
    # the saved model is a standard AutoModelForSequenceClassification with no PEFT dependency
    merged = model.merge_and_unload()
    merged.save_pretrained(str(OUTPUT_DIR))
    tokenizer.save_pretrained(str(OUTPUT_DIR))
    print(f"\nMerged model saved to {OUTPUT_DIR}")

    # Sanity check
    from transformers import pipeline
    clf = pipeline("text-classification", model=str(OUTPUT_DIR), tokenizer=str(OUTPUT_DIR))
    tests = [
        ("1 год опыта Python, Flask. Первая работа в IT.", "junior"),
        ("5 лет Python, FastAPI, team lead, code review, микросервисы.", "middle"),
        ("10 лет, Solution Architect. ML платформа на 50M пользователей.", "senior"),
        ("3 years experience, React, TypeScript, built features independently.", "middle"),
        ("Intern, 3 months, basic HTML/CSS, learning JavaScript.", "junior"),
    ]
    print("\nSanity check:")
    correct = 0
    for text, expected in tests:
        result = clf(text[:MAX_LEN])
        pred = result[0]["label"].lower()
        score = round(result[0]["score"], 3)
        ok = pred == expected
        correct += ok
        print(f"  {'✓' if ok else '✗'} expected={expected:6s} got={pred:6s} ({score}) | {text[:60]}")
    print(f"\n{correct}/{len(tests)} sanity examples correct")


if __name__ == "__main__":
    main()
