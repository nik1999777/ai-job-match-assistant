import logging
from typing import Any, Literal

from langchain_core.prompts import ChatPromptTemplate
from pydantic import BaseModel, Field

from api.llm.provider import get_llm
from api.settings import settings

logger = logging.getLogger(__name__)

_SKILL_KWS = frozenset([
    "навык", "skill", "стек", "stack", "технолог",
    "инструмент", "tools", "компетенц", "владею",
])
_SKILL_WINDOW = 40


def smart_truncate_resume(text: str, limit: int) -> str:
    if len(text) <= limit:
        return text

    lines = text.splitlines()
    skill_idx = next(
        (i for i, ln in enumerate(lines) if any(kw in ln.lower() for kw in _SKILL_KWS)),
        None,
    )

    if skill_idx is None or skill_idx == 0:
        return text[:limit]

    window_end = min(skill_idx + _SKILL_WINDOW, len(lines))
    skill_block = "\n".join(lines[skill_idx:window_end])
    rest = "\n".join(lines[:skill_idx] + lines[window_end:])
    return (skill_block + "\n\n" + rest)[:limit]


class ParsedData(BaseModel):
    resume_summary: str = Field(description="1-2 sentence summary of the candidate's profile")
    vacancy_summary: str = Field(description="1-2 sentence summary of the job requirements")
    resume_skills: list[str] = Field(
        description=(
            "Confirmed technical skills the candidate currently has — one skill per item. "
            "EXCLUDE skills the candidate is still learning or studying "
            "('изучаю', 'learning', 'studying', 'в процессе' → do NOT include). "
            "Split compound strings: 'TypeScript + React' → ['TypeScript', 'React'], "
            "'GitLab CI/CD' → ['GitLab'], 'LoRA/PEFT' → ['LoRA', 'PEFT'], "
            "'Python/Go' → ['Python', 'Go']. "
            "Normalize to root technology: 'react-router' → 'React', 'axios' → 'REST API'. "
            "Strip versions: 'React 18' → 'React'. No duplicates."
        )
    )
    vacancy_skills: list[str] = Field(
        description=(
            "Individual technical skills required by the vacancy — one skill per item. "
            "For OR conditions pick the first option: 'GitLab или GitHub Actions' → ['GitLab'], "
            "'FastAPI или Django' → ['FastAPI']. "
            "Split compound strings: 'TypeScript + React' → ['TypeScript', 'React'], "
            "'Prometheus/Grafana' → ['Prometheus', 'Grafana'], "
            "'Python/Go' → ['Python', 'Go']. "
            "Normalize to root technology: 'React 19' → 'React', 'Node.js 20' → 'Node.js'. "
            "No duplicates."
        )
    )
    vacancy_seniority_hint: Literal["junior", "middle", "senior", "not specified"]


PROMPT = ChatPromptTemplate.from_messages([
    ("system", "You are a structured data extractor for HR tech. Extract information precisely."),
    ("human", """Extract structured information from the resume and vacancy below.

RESUME:
{resume}

VACANCY:
{vacancy}"""),
])


async def parse_node(state: dict[str, Any]) -> dict[str, Any]:
    resume = smart_truncate_resume(state["resume"], settings.resume_context_limit)
    vacancy = state["vacancy"][:settings.vacancy_context_limit]

    llm = get_llm()
    chain = PROMPT | llm.with_structured_output(ParsedData)

    try:
        result: ParsedData = await chain.ainvoke({"resume": resume, "vacancy": vacancy})
        parsed = result.model_dump()
    except Exception as exc:
        logger.warning("parse_node: structured output failed (%s), returning empty parsed", exc)
        parsed = {}

    return {**state, "parsed": parsed}
