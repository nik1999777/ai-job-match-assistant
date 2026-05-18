from typing import Any

from api.ml.skill_extractor import SkillExtractor
from api.ml.seniority_clf import SeniorityClassifier
from api.rag.retriever import retrieve_similar_vacancies

_skill_extractor = SkillExtractor()
_seniority_clf = SeniorityClassifier()


async def gap_node(state: dict[str, Any]) -> dict[str, Any]:
    parsed = state.get("parsed", {})

    # ML: extract skills via fine-tuned BERT NER
    resume_skills = _skill_extractor.extract(state["resume"])
    vacancy_skills = _skill_extractor.extract(state["vacancy"])

    # fall back to LLM-parsed skills if NER returns nothing
    if not resume_skills:
        resume_skills = parsed.get("resume_skills", [])
    if not vacancy_skills:
        vacancy_skills = parsed.get("vacancy_skills", [])

    resume_set = {s.lower() for s in resume_skills}
    vacancy_set = {s.lower() for s in vacancy_skills}

    found = sorted(resume_set & vacancy_set)
    missing = sorted(vacancy_set - resume_set)

    match_score = len(found) / max(len(vacancy_set), 1)

    # ML: seniority classification via DistilBERT + LoRA
    seniority, confidence = _seniority_clf.classify(state["resume"])

    # RAG: pull similar vacancies for context
    similar = await retrieve_similar_vacancies(state["vacancy"], top_k=3)

    return {
        **state,
        "skills_found": found,
        "skills_missing": missing,
        "match_score": round(match_score, 3),
        "seniority": seniority,
        "seniority_confidence": confidence,
        "similar_vacancies": similar,
    }
