import asyncio
import hashlib
import logging
import re
from typing import Any

from qdrant_client import AsyncQdrantClient

from api.ml.skill_extractor import SkillExtractor
from api.ml.seniority_clf import SeniorityClassifier
from api.rag.indexer import index_vacancy
from api.rag.retriever import retrieve_similar_vacancies
from api.settings import settings

logger = logging.getLogger(__name__)

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


async def _auto_index_vacancy(text: str, title: str, skills: list[str]) -> None:
    try:
        vacancy_id = hashlib.md5(text.encode()).hexdigest()[:12]
        client = AsyncQdrantClient(url=settings.qdrant_url)
        await index_vacancy(client, vacancy_id, title, text, skills)
    except Exception as exc:
        logger.debug("auto-index skipped: %s", exc)


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

    title = parsed.get("vacancy_summary", "")[:120] or state["vacancy"].splitlines()[0][:120]
    asyncio.create_task(_auto_index_vacancy(state["vacancy"], title, vacancy_skills))

    return {
        **state,
        "skills_found": found,
        "skills_missing": missing,
        "match_score": round(match_score, 3),
        "seniority": seniority,
        "seniority_confidence": confidence,
        "similar_vacancies": similar,
    }
