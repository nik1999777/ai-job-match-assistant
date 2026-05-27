from functools import cache

NER_MODEL = "dslim/bert-base-NER"
# BERT max is 512 tokens; ~1800 chars ≈ 450 tokens — safe upper bound per chunk
MAX_CHARS = 1800


@cache
def _get_ner_pipeline():
    from transformers import pipeline
    return pipeline("ner", model=NER_MODEL, aggregation_strategy="simple")


def _extract_chunk(ner, text: str, seen: set[str], skills: list[str]) -> None:
    entities = ner(text)
    for e in entities:
        word = e["word"].strip()
        # MISC = frameworks/tools/tech; ORG catches "Docker", "Google Cloud"
        # Skip BERT subword artifacts (## prefix) that leak on out-of-vocab languages
        if (
            e["entity_group"] in ("MISC", "ORG")
            and len(word) > 1
            and not word.startswith("##")
        ):
            low = word.lower()
            if low not in seen:
                seen.add(low)
                skills.append(word)


class SkillExtractor:
    def extract(self, text: str) -> list[str]:
        if not text or not text.strip():
            return []
        try:
            ner = _get_ner_pipeline()
            seen: set[str] = set()
            skills: list[str] = []
            # Head chunk: experience section
            _extract_chunk(ner, text[:MAX_CHARS], seen, skills)
            # Tail chunk: dedicated skills section usually lives at the end
            if len(text) > MAX_CHARS:
                _extract_chunk(ner, text[-MAX_CHARS:], seen, skills)
            return skills
        except Exception:
            return []
