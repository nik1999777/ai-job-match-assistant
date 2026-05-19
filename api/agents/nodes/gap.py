import re
from typing import Any

from api.ml.skill_extractor import SkillExtractor
from api.ml.seniority_clf import SeniorityClassifier
from api.rag.retriever import retrieve_similar_vacancies

_skill_extractor = SkillExtractor()
_seniority_clf = SeniorityClassifier()

# split "LangChain/LangGraph or analogues (Milvus, Qdrant)" → individual terms
_SEP = re.compile(r"[/,;()\[\]|]|\s+(?:or|and|analogues?)\s+", re.IGNORECASE)


def _expand(skills: list[str]) -> dict[str, str]:
    """Return {lowercase_token: original_skill_name} expanding compound strings."""
    result: dict[str, str] = {}
    for skill in skills:
        for part in _SEP.split(skill):
            part = part.strip(" .-_")
            if len(part) > 1:
                result[part.lower()] = skill
    return result


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

    # expand compound strings ("X/Y or Z") before comparing
    resume_exp = _expand(resume_skills)
    vacancy_exp = _expand(vacancy_skills)

    matched_tokens = set(resume_exp) & set(vacancy_exp)

    # found: original resume skill names that matched
    found = sorted({resume_exp[t] for t in matched_tokens if len(resume_exp[t]) > 1})
    # missing: original vacancy skill names with no match
    matched_vacancy_originals = {vacancy_exp[t] for t in matched_tokens}
    missing = sorted(
        s for s in set(vacancy_skills) - matched_vacancy_originals
        if len(s) > 1
    )

    match_score = len(matched_tokens) / max(len(vacancy_exp), 1)

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
