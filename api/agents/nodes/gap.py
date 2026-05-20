import re
from typing import Any

from api.ml.skill_extractor import SkillExtractor
from api.ml.seniority_clf import SeniorityClassifier
from api.rag.retriever import retrieve_similar_vacancies

_skill_extractor = SkillExtractor()
_seniority_clf = SeniorityClassifier()

# punctuation-only split — semantic splitting is handled by the LLM in parse_node
_SEP = re.compile(r"[/,;()\[\]|]")


def _expand(skills: list[str]) -> dict[str, str]:
    result: dict[str, str] = {}
    for skill in skills:
        for part in _SEP.split(skill):
            part = part.strip(" .-_+")
            if len(part) > 1:
                result[part.lower()] = skill
    return result


async def gap_node(state: dict[str, Any]) -> dict[str, Any]:
    parsed = state.get("parsed", {})

    resume_skills = _skill_extractor.extract(state["resume"])
    vacancy_skills = _skill_extractor.extract(state["vacancy"])

    if not resume_skills:
        resume_skills = parsed.get("resume_skills", [])
    if not vacancy_skills:
        vacancy_skills = parsed.get("vacancy_skills", [])

    resume_exp = _expand(resume_skills)
    vacancy_exp = _expand(vacancy_skills)

    matched_tokens = set(resume_exp) & set(vacancy_exp)

    found = sorted({resume_exp[t] for t in matched_tokens if len(resume_exp[t]) > 1})
    matched_vacancy_originals = {vacancy_exp[t] for t in matched_tokens}
    missing = sorted(
        s for s in set(vacancy_skills) - matched_vacancy_originals
        if len(s) > 1
    )

    match_score = len(matched_tokens) / max(len(vacancy_exp), 1)

    seniority, confidence = _seniority_clf.classify(state["resume"])
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
