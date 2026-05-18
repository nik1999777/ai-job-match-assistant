from functools import cache

NER_MODEL = "dslim/bert-base-NER"
# BERT max is 512 tokens; ~1800 chars ≈ 450 tokens — safe upper bound
MAX_CHARS = 1800


@cache
def _get_ner_pipeline():
    from transformers import pipeline
    return pipeline("ner", model=NER_MODEL, aggregation_strategy="simple")


class SkillExtractor:
    def extract(self, text: str) -> list[str]:
        if not text or not text.strip():
            return []
        try:
            ner = _get_ner_pipeline()
            entities = ner(text[:MAX_CHARS])
            seen: set[str] = set()
            skills: list[str] = []
            for e in entities:
                word = e["word"].strip()
                # MISC = frameworks/tools/tech; ORG catches "Docker", "Google Cloud"
                if e["entity_group"] in ("MISC", "ORG") and len(word) > 1:
                    low = word.lower()
                    if low not in seen:
                        seen.add(low)
                        skills.append(word)
            return skills
        except Exception:
            return []
