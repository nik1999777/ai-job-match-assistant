import logging
from typing import Any, Literal

from langchain_core.prompts import ChatPromptTemplate
from pydantic import BaseModel, Field

from api.llm.provider import get_llm

logger = logging.getLogger(__name__)

# llama3 via Ollama has a 8k context window; cap inputs to stay well within it
_RESUME_LIMIT = 4000
_VACANCY_LIMIT = 2000

_SKILL_KWS = frozenset([
    "навык", "skill", "стек", "stack", "технолог",
    "инструмент", "tools", "компетенц", "владею",
])
_SKILL_WINDOW = 40  # lines to capture after the skills section header


def smart_truncate_resume(text: str, limit: int = _RESUME_LIMIT) -> str:
    """Truncate resume to limit characters, keeping the skills section near the top.

    Plain slicing can cut mid-skills-section when skills appear late in the text.
    This function moves the skills block to the front before truncating so the LLM
    always sees the full list of technologies.
    """
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
            "Base technical skills from the resume. Normalize to root technology: "
            "'react-router' → 'React', 'axios' → 'REST API', 'Apollo Client' → 'GraphQL'. "
            "Strip versions: 'React 18' → 'React'. No duplicates."
        )
    )
    vacancy_skills: list[str] = Field(
        description=(
            "Base technical skills required by the vacancy. Same normalization rules: "
            "'React 19' → 'React', 'Node.js 20' → 'Node.js'. No duplicates."
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
    resume = smart_truncate_resume(state["resume"], _RESUME_LIMIT)
    vacancy = state["vacancy"][:_VACANCY_LIMIT]

    llm = get_llm()
    chain = PROMPT | llm.with_structured_output(ParsedData)

    try:
        result: ParsedData = await chain.ainvoke({"resume": resume, "vacancy": vacancy})
        parsed = result.model_dump()
    except Exception as exc:
        logger.warning("parse_node: structured output failed (%s), returning empty parsed", exc)
        parsed = {}

    return {**state, "parsed": parsed}
