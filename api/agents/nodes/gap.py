import asyncio
import hashlib
import logging
from typing import Any

from qdrant_client import AsyncQdrantClient

from api.ml.skill_extractor import SkillExtractor
from api.ml.skill_matcher import match_skills, merge_skills
from api.ml.seniority_clf import SeniorityClassifier
from api.rag.indexer import index_vacancy
from api.rag.retriever import retrieve_similar_vacancies
from api.settings import settings

logger = logging.getLogger(__name__)

_skill_extractor = SkillExtractor()
_seniority_clf = SeniorityClassifier()

_SENIORITY_LEVELS = {"junior": 0, "middle": 1, "senior": 2}


def _seniority_penalty(candidate: str, vacancy_hint: str) -> float:
    """10% penalty per seniority level underqualification, capped at 20%."""
    if vacancy_hint not in _SENIORITY_LEVELS:
        return 0.0
    c = _SENIORITY_LEVELS.get(candidate, 1)
    v = _SENIORITY_LEVELS[vacancy_hint]
    gap = v - c
    if gap <= 0:
        return 0.0
    return min(gap * 0.10, 0.20)


async def _auto_index_vacancy(text: str, title: str, skills: list[str]) -> None:
    try:
        vacancy_id = hashlib.md5(text.encode()).hexdigest()[:12]
        client = AsyncQdrantClient(url=settings.qdrant_url)
        await index_vacancy(client, vacancy_id, title, text, skills)
    except Exception as exc:
        logger.debug("auto-index skipped: %s", exc)


async def gap_node(state: dict[str, Any]) -> dict[str, Any]:
    parsed = state.get("parsed", {})

    resume_skills = merge_skills(
        parsed.get("resume_skills", []),
        _skill_extractor.extract(state["resume"]),
    )
    vacancy_skills = merge_skills(
        parsed.get("vacancy_skills", []),
        _skill_extractor.extract(state["vacancy"]),
    )

    found, missing, raw_score = match_skills(resume_skills, vacancy_skills)

    seniority, confidence = _seniority_clf.classify(state["resume"])
    vacancy_hint = parsed.get("vacancy_seniority_hint", "not specified")
    penalty = _seniority_penalty(seniority, vacancy_hint)
    match_score = round(raw_score * (1 - penalty), 3)

    similar = await retrieve_similar_vacancies(state["vacancy"], top_k=3)

    title = parsed.get("vacancy_summary", "")[:120] or state["vacancy"].splitlines()[0][:120]
    asyncio.create_task(_auto_index_vacancy(state["vacancy"], title, vacancy_skills))

    return {
        **state,
        "skills_found": found,
        "skills_missing": missing,
        "match_score": match_score,
        "seniority": seniority,
        "seniority_confidence": confidence,
        "similar_vacancies": similar,
    }
