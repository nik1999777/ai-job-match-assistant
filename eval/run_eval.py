"""
Eval runner — measures quality of the job match pipeline against ground-truth cases.

Usage:
    python -m eval.run_eval               # offline metrics only
    python -m eval.run_eval --judge       # + LLM-as-a-judge (requires OPENAI_API_KEY)

Prerequisites:
    docker-compose up -d qdrant db        # Qdrant + Postgres must be up for gap_node
"""

import argparse
import asyncio
import json
import logging
import sys
from datetime import date
from pathlib import Path

from eval.dataset import TEST_CASES, EvalCase
from eval.judge import judge_advice
from eval.metrics import match_score_in_range, match_score_mae, rouge_l, skill_recall

logging.basicConfig(level=logging.WARNING, format="%(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("eval")

RESULTS_DIR = Path(__file__).parent / "results"


async def evaluate_one(case: EvalCase, run_judge: bool) -> dict:
    from api.agents.graph import build_graph
    from api.llm.streaming import run_graph

    graph = build_graph()

    try:
        state = await run_graph(graph, case.resume, case.vacancy, mode="seeker")
    except Exception as exc:
        logger.error("case %d: graph failed — %s", case.id, exc)
        state = {}

    predicted_score = state.get("match_score", 0.0)
    predicted_missing = state.get("skills_missing", [])
    predicted_seniority = state.get("seniority", "unknown")
    advice = state.get("llm_response", "")

    result: dict = {
        "test_id": case.id,
        "description": case.description,
        "match_score_predicted": predicted_score,
        "match_score_in_range": match_score_in_range(predicted_score, case.expected_match_range),
        "match_score_mae": match_score_mae(predicted_score, case.expected_match_range),
        "skill_recall": skill_recall(predicted_missing, case.expected_missing_skills),
        "seniority_predicted": predicted_seniority,
        "seniority_correct": predicted_seniority == case.expected_seniority,
        "rouge_l": rouge_l(advice, case.reference_advice) if advice else None,
        "skills_missing_predicted": predicted_missing,
        "judge_relevance": None,
        "judge_actionability": None,
        "judge_accuracy": None,
        "judge_reasoning": None,
    }

    if run_judge:
        score = await judge_advice(case.resume, case.vacancy, state)
        if score:
            result["judge_relevance"] = score.relevance
            result["judge_actionability"] = score.actionability
            result["judge_accuracy"] = score.accuracy
            result["judge_reasoning"] = score.reasoning

    return result


def _print_summary(results: list[dict]) -> None:
    n = len(results)
    in_range = sum(1 for r in results if r["match_score_in_range"])
    seniority_ok = sum(1 for r in results if r["seniority_correct"])
    avg_recall = sum(r["skill_recall"] for r in results) / n
    avg_rouge = [r["rouge_l"] for r in results if r["rouge_l"] is not None]
    avg_mae = sum(r["match_score_mae"] for r in results) / n

    judge_scores = [r for r in results if r["judge_relevance"] is not None]

    print("\n" + "=" * 60)
    print(f"EVAL SUMMARY  ({n} cases, {date.today()})")
    print("=" * 60)
    print(f"  Match score in range : {in_range}/{n}  ({in_range/n:.0%})")
    print(f"  Match score MAE      : {avg_mae:.3f}  (0 = perfect)")
    print(f"  Seniority accuracy   : {seniority_ok}/{n}  ({seniority_ok/n:.0%})")
    print(f"  Skill recall         : {avg_recall:.3f}  (1.0 = all gaps found)")
    if avg_rouge:
        print(f"  Rouge-L (advice)     : {sum(avg_rouge)/len(avg_rouge):.3f}")
    if judge_scores:
        def avg(key: str) -> float:
            return sum(r[key] for r in judge_scores) / len(judge_scores)
        print(f"\n  LLM Judge (avg over {len(judge_scores)} cases):")
        print(f"    relevance      : {avg('judge_relevance'):.2f}/5")
        print(f"    actionability  : {avg('judge_actionability'):.2f}/5")
        print(f"    accuracy       : {avg('judge_accuracy'):.2f}/5")
    print("=" * 60)

    print("\nPer-case breakdown:")
    for r in results:
        status = "✓" if r["match_score_in_range"] else "✗"
        print(
            f"  [{status}] #{r['test_id']:02d}  "
            f"score={r['match_score_predicted']:.2f}  "
            f"recall={r['skill_recall']:.2f}  "
            f"seniority={'ok' if r['seniority_correct'] else 'WRONG'}  "
            f"| {r['description'][:50]}"
        )


async def main(run_judge: bool) -> None:
    RESULTS_DIR.mkdir(exist_ok=True)

    print(f"Running eval on {len(TEST_CASES)} cases...")
    results = []
    for case in TEST_CASES:
        print(f"  case {case.id}: {case.description[:55]}...", flush=True)
        result = await evaluate_one(case, run_judge=run_judge)
        results.append(result)

    _print_summary(results)

    out_file = RESULTS_DIR / f"eval_{date.today()}.jsonl"
    with out_file.open("w", encoding="utf-8") as f:
        for r in results:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")

    print(f"\nResults saved to {out_file}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--judge", action="store_true", help="Run LLM-as-a-judge (costs API credits)")
    args = parser.parse_args()

    try:
        asyncio.run(main(run_judge=args.judge))
    except KeyboardInterrupt:
        sys.exit(0)
