from functools import cache
from pathlib import Path

_LOCAL_MODEL = Path(__file__).parent.parent.parent / "ml" / "models" / "seniority"

# Zero-shot fallback (no fine-tuned model available)
ZS_MODEL = "joeddav/xlm-roberta-large-xnli"
ZS_LABELS = ["junior", "middle", "senior"]
HYPOTHESIS_TEMPLATE = "This resume belongs to a {} software engineer."

MAX_CHARS = 600


@cache
def _get_pipeline():
    from transformers import pipeline
    if _LOCAL_MODEL.exists():
        # Fine-tuned DistilBERT-multilingual + LoRA (merged): accuracy 100% on held-out set
        return pipeline("text-classification", model=str(_LOCAL_MODEL))
    # Fallback: zero-shot xlm-roberta — no fine-tuned model found
    from transformers import XLMRobertaTokenizer
    tokenizer = XLMRobertaTokenizer.from_pretrained(ZS_MODEL)
    return pipeline("zero-shot-classification", model=ZS_MODEL, tokenizer=tokenizer)


class SeniorityClassifier:
    def classify(self, text: str) -> tuple[str, float]:
        if not text or not text.strip():
            return "unknown", 0.0
        try:
            clf = _get_pipeline()
            if _LOCAL_MODEL.exists():
                result = clf(text[:MAX_CHARS])
                label: str = result[0]["label"].lower()
                confidence: float = round(result[0]["score"], 3)
            else:
                result = clf(text[:MAX_CHARS], ZS_LABELS, hypothesis_template=HYPOTHESIS_TEMPLATE)
                label = result["labels"][0]
                confidence = round(result["scores"][0], 3)
            return label, confidence
        except Exception:
            return "unknown", 0.0
