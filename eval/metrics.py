from rouge_score import rouge_scorer

_scorer = rouge_scorer.RougeScorer(["rougeL"], use_stemmer=False)


def rouge_l(generated: str, reference: str) -> float:
    return round(_scorer.score(reference, generated)["rougeL"].fmeasure, 4)


def skill_recall(predicted_missing: list[str], expected_missing: list[str]) -> float:
    """Fraction of expected missing skills the system correctly flagged (sensitivity)."""
    if not expected_missing:
        return 1.0
    pred_lower = {s.lower() for s in predicted_missing}
    hits = sum(
        1 for s in expected_missing
        if any(s.lower() in p or p in s.lower() for p in pred_lower)
    )
    return round(hits / len(expected_missing), 3)


def skill_precision(predicted_missing: list[str], expected_missing: list[str]) -> float:
    """Fraction of predicted missing skills that are actually expected (avoids false alarms)."""
    if not predicted_missing:
        return 1.0
    if not expected_missing:
        return 0.0
    exp_lower = {s.lower() for s in expected_missing}
    hits = sum(
        1 for p in predicted_missing
        if any(p.lower() in e or e in p.lower() for e in exp_lower)
    )
    return round(hits / len(predicted_missing), 3)


def skill_f1(recall: float, precision: float) -> float:
    """Harmonic mean of skill recall and precision."""
    if recall + precision == 0:
        return 0.0
    return round(2 * recall * precision / (recall + precision), 3)


def match_score_mae(predicted: float, expected_range: tuple[float, float]) -> float:
    """Distance from predicted score to the nearest edge of the expected range (0 if inside)."""
    lo, hi = expected_range
    if lo <= predicted <= hi:
        return 0.0
    return round(min(abs(predicted - lo), abs(predicted - hi)), 3)


def match_score_in_range(predicted: float, expected_range: tuple[float, float]) -> bool:
    lo, hi = expected_range
    return lo <= predicted <= hi
