from rouge_score import rouge_scorer

_scorer = rouge_scorer.RougeScorer(["rougeL"], use_stemmer=False)


def rouge_l(generated: str, reference: str) -> float:
    return round(_scorer.score(reference, generated)["rougeL"].fmeasure, 4)


def skill_recall(predicted_missing: list[str], expected_missing: list[str]) -> float:
    """Fraction of expected missing skills that the system correctly flagged as missing."""
    if not expected_missing:
        return 1.0
    pred_lower = {s.lower() for s in predicted_missing}
    hits = sum(
        1 for s in expected_missing
        if any(s.lower() in p or p in s.lower() for p in pred_lower)
    )
    return round(hits / len(expected_missing), 3)


def match_score_mae(predicted: float, expected_range: tuple[float, float]) -> float:
    """Distance from predicted score to the nearest edge of the expected range (0 if inside)."""
    lo, hi = expected_range
    if lo <= predicted <= hi:
        return 0.0
    return round(min(abs(predicted - lo), abs(predicted - hi)), 3)


def match_score_in_range(predicted: float, expected_range: tuple[float, float]) -> bool:
    lo, hi = expected_range
    return lo <= predicted <= hi
