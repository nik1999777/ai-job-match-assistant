"""
Eval runner — measures quality of the job match pipeline against ground-truth cases.

Usage:
    python -m eval.run_eval               # offline metrics only
    python -m eval.run_eval --judge       # + LLM-as-a-judge (requires OPENAI_API_KEY)

Prerequisites:
    docker-compose up -d postgres qdrant  # Qdrant + Postgres must be up for gap_node
"""

import argparse
import asyncio
import json
import logging
import sys
import time
from datetime import date
from pathlib import Path

import mlflow

from eval.dataset import TEST_CASES, EvalCase
from eval.judge import judge_advice
from eval.metrics import (
    match_score_in_range,
    match_score_mae,
    rouge_l,
    skill_f1,
    skill_precision,
    skill_recall,
)

logging.basicConfig(level=logging.WARNING, format="%(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("eval")

RESULTS_DIR = Path(__file__).parent / "results"


async def evaluate_one(case: EvalCase, run_judge: bool) -> dict:
    from api.agents.graph import build_graph
    from api.llm.streaming import run_graph

    graph = build_graph()

    t0 = time.perf_counter()
    try:
        state = await run_graph(graph, case.resume, case.vacancy, mode="seeker")
    except Exception as exc:
        logger.error("case %d: graph failed — %s", case.id, exc)
        state = {}
    latency_ms = round((time.perf_counter() - t0) * 1000)

    predicted_score = state.get("match_score", 0.0)
    predicted_missing = state.get("skills_missing", [])
    predicted_seniority = state.get("seniority", "unknown")
    advice = state.get("llm_response", "")

    recall = skill_recall(predicted_missing, case.expected_missing_skills)
    precision = skill_precision(predicted_missing, case.expected_missing_skills)

    result: dict = {
        "test_id": case.id,
        "description": case.description,
        "latency_ms": latency_ms,
        "match_score_predicted": predicted_score,
        "match_score_in_range": match_score_in_range(predicted_score, case.expected_match_range),
        "match_score_mae": match_score_mae(predicted_score, case.expected_match_range),
        "skill_recall": recall,
        "skill_precision": precision,
        "skill_f1": skill_f1(recall, precision),
        "seniority_predicted": predicted_seniority,
        "seniority_correct": predicted_seniority == case.expected_seniority,
        "rouge_l": rouge_l(advice, case.reference_advice) if advice else None,
        "skills_missing_predicted": predicted_missing,
        "judge_relevance": None,
        "judge_actionability": None,
        "judge_accuracy": None,
        "judge_faithfulness": None,
        "judge_reasoning": None,
    }

    if run_judge:
        score = await judge_advice(case.resume, case.vacancy, state)
        if score:
            result["judge_relevance"] = score.relevance
            result["judge_actionability"] = score.actionability
            result["judge_accuracy"] = score.accuracy
            result["judge_faithfulness"] = score.faithfulness
            result["judge_reasoning"] = score.reasoning

    return result


def _load_baseline(today: date) -> list[dict] | None:
    """Load the most recent previous eval results for regression comparison."""
    files = sorted(RESULTS_DIR.glob("eval_*.jsonl"))
    # Exclude today's file if it already exists
    prev = [f for f in files if f.stem != f"eval_{today}"]
    if not prev:
        return None
    with prev[-1].open(encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]


def _avg(results: list[dict], key: str) -> float | None:
    vals = [r[key] for r in results if r.get(key) is not None]
    return round(sum(vals) / len(vals), 3) if vals else None


def _delta_str(current: float | None, baseline: float | None, higher_is_better: bool = True) -> str:
    if current is None or baseline is None:
        return ""
    delta = current - baseline
    if abs(delta) < 0.001:
        return "  (→ no change)"
    sign = "+" if delta > 0 else ""
    good = (delta > 0) == higher_is_better
    marker = "✓" if good else "⚠"
    return f"  ({marker} {sign}{delta:.3f} vs baseline)"


def _print_summary(results: list[dict], baseline: list[dict] | None) -> None:
    n = len(results)
    in_range = sum(1 for r in results if r["match_score_in_range"])
    seniority_ok = sum(1 for r in results if r["seniority_correct"])

    avg_recall = _avg(results, "skill_recall")
    avg_precision = _avg(results, "skill_precision")
    avg_f1 = _avg(results, "skill_f1")
    avg_mae = _avg(results, "match_score_mae")
    avg_rouge = _avg(results, "rouge_l")
    avg_latency = _avg(results, "latency_ms")

    b_recall = _avg(baseline, "skill_recall") if baseline else None
    b_precision = _avg(baseline, "skill_precision") if baseline else None
    b_f1 = _avg(baseline, "skill_f1") if baseline else None
    b_mae = _avg(baseline, "match_score_mae") if baseline else None
    b_rouge = _avg(baseline, "rouge_l") if baseline else None

    judge_rows = [r for r in results if r.get("judge_relevance") is not None]
    b_judge = [r for r in (baseline or []) if r.get("judge_relevance") is not None]

    print("\n" + "=" * 65)
    print(f"EVAL SUMMARY  ({n} cases, {date.today()})")
    print("=" * 65)
    print(f"  Match score in range : {in_range}/{n}  ({in_range/n:.0%})")
    print(f"  Match score MAE      : {avg_mae}{_delta_str(avg_mae, b_mae, higher_is_better=False)}")
    print(f"  Seniority accuracy   : {seniority_ok}/{n}  ({seniority_ok/n:.0%})")
    print()
    print(f"  Skill recall         : {avg_recall}{_delta_str(avg_recall, b_recall)}")
    print(f"  Skill precision      : {avg_precision}{_delta_str(avg_precision, b_precision)}")
    print(f"  Skill F1             : {avg_f1}{_delta_str(avg_f1, b_f1)}")
    if avg_rouge is not None:
        print(f"  Rouge-L (advice)     : {avg_rouge}{_delta_str(avg_rouge, b_rouge)}")
    if avg_latency is not None:
        print(f"  Avg latency          : {avg_latency} ms")

    if judge_rows:
        avg_rel = _avg(judge_rows, "judge_relevance")
        avg_act = _avg(judge_rows, "judge_actionability")
        avg_acc = _avg(judge_rows, "judge_accuracy")
        avg_fth = _avg(judge_rows, "judge_faithfulness")
        b_rel = _avg(b_judge, "judge_relevance") if b_judge else None
        b_act = _avg(b_judge, "judge_actionability") if b_judge else None
        b_acc = _avg(b_judge, "judge_accuracy") if b_judge else None
        b_fth = _avg(b_judge, "judge_faithfulness") if b_judge else None
        print(f"\n  LLM Judge (avg over {len(judge_rows)} cases):")
        print(f"    relevance      : {avg_rel}/5{_delta_str(avg_rel, b_rel)}")
        print(f"    actionability  : {avg_act}/5{_delta_str(avg_act, b_act)}")
        print(f"    accuracy       : {avg_acc}/5{_delta_str(avg_acc, b_acc)}")
        print(f"    faithfulness   : {avg_fth}/5{_delta_str(avg_fth, b_fth)}")

    print("=" * 65)

    print("\nPer-case breakdown:")
    for r in results:
        status = "✓" if r["match_score_in_range"] else "✗"
        print(
            f"  [{status}] #{r['test_id']:02d}  "
            f"score={r['match_score_predicted']:.2f}  "
            f"recall={r['skill_recall']:.2f}  "
            f"precision={r['skill_precision']:.2f}  "
            f"f1={r['skill_f1']:.2f}  "
            f"latency={r['latency_ms']}ms  "
            f"| {r['description'][:40]}"
        )


async def main(run_judge: bool) -> None:
    RESULTS_DIR.mkdir(exist_ok=True)
    baseline = _load_baseline(date.today())
    if baseline:
        print(f"Baseline loaded: {len(baseline)} cases from previous run")

    print(f"Running eval on {len(TEST_CASES)} cases...")
    results = []
    for case in TEST_CASES:
        print(f"  case {case.id}: {case.description[:55]}...", flush=True)
        result = await evaluate_one(case, run_judge=run_judge)
        results.append(result)

    _print_summary(results, baseline)

    out_file = RESULTS_DIR / f"eval_{date.today()}.jsonl"
    with out_file.open("w", encoding="utf-8") as f:
        for r in results:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")

    print(f"\nResults saved to {out_file}")
    _log_mlflow(results, run_judge)


def _log_mlflow(results: list[dict], run_judge: bool) -> None:
    """Log eval results to MLflow for experiment tracking."""
    try:
        from api.settings import settings
        mlflow.set_experiment("job-match-eval")
        n = len(results)
        with mlflow.start_run(run_name=f"eval_{date.today()}"):
            mlflow.log_params({
                "n_cases": n,
                "with_judge": run_judge,
                "llm_provider": settings.llm_provider,
                "model": settings.ollama_model if settings.llm_provider == "ollama" else settings.openai_model,
            })
            in_range = sum(1 for r in results if r["match_score_in_range"])
            seniority_ok = sum(1 for r in results if r["seniority_correct"])
            mlflow.log_metrics({
                "match_in_range_pct": round(in_range / n, 3),
                "match_score_mae": _avg(results, "match_score_mae") or 0.0,
                "seniority_accuracy": round(seniority_ok / n, 3),
                "skill_recall": _avg(results, "skill_recall") or 0.0,
                "skill_precision": _avg(results, "skill_precision") or 0.0,
                "skill_f1": _avg(results, "skill_f1") or 0.0,
                "rouge_l": _avg(results, "rouge_l") or 0.0,
                "avg_latency_ms": _avg(results, "latency_ms") or 0.0,
            })
            judge_rows = [r for r in results if r.get("judge_relevance") is not None]
            if judge_rows:
                mlflow.log_metrics({
                    "judge_relevance": _avg(judge_rows, "judge_relevance") or 0.0,
                    "judge_actionability": _avg(judge_rows, "judge_actionability") or 0.0,
                    "judge_accuracy": _avg(judge_rows, "judge_accuracy") or 0.0,
                    "judge_faithfulness": _avg(judge_rows, "judge_faithfulness") or 0.0,
                })
            mlflow.log_artifact(str(RESULTS_DIR / f"eval_{date.today()}.jsonl"))
        print("MLflow run logged → run: mlflow ui --port 5001")
    except Exception as exc:
        logger.warning("MLflow logging skipped: %s", exc)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--judge", action="store_true", help="Run LLM-as-a-judge (costs API credits)")
    args = parser.parse_args()

    try:
        asyncio.run(main(run_judge=args.judge))
    except KeyboardInterrupt:
        sys.exit(0)
