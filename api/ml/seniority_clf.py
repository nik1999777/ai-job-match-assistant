from functools import cache

# Multilingual NLI model — handles Russian resumes from hh.ru
ZS_MODEL = "joeddav/xlm-roberta-large-xnli"
LABELS = ["junior", "middle", "senior"]
# Hypothesis in English; xlm-roberta aligns it against any-language premise
HYPOTHESIS_TEMPLATE = "This resume belongs to a {} software engineer."
# Seniority signal is dense in the intro — 600 chars is enough
MAX_CHARS = 600


@cache
def _get_zs_pipeline():
    from transformers import XLMRobertaTokenizer, pipeline
    # AutoTokenizer fails for xlm-roberta in transformers>=4.47 — load slow tokenizer explicitly
    tokenizer = XLMRobertaTokenizer.from_pretrained(ZS_MODEL)
    return pipeline("zero-shot-classification", model=ZS_MODEL, tokenizer=tokenizer)


class SeniorityClassifier:
    def classify(self, text: str) -> tuple[str, float]:
        if not text or not text.strip():
            return "unknown", 0.0
        try:
            clf = _get_zs_pipeline()
            result = clf(
                text[:MAX_CHARS],
                LABELS,
                hypothesis_template=HYPOTHESIS_TEMPLATE,
            )
            label: str = result["labels"][0]
            confidence: float = round(result["scores"][0], 3)
            return label, confidence
        except Exception:
            return "unknown", 0.0
