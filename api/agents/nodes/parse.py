import logging
from typing import Any

from langchain_core.prompts import ChatPromptTemplate
from pydantic import BaseModel, Field, field_validator

from api.llm.provider import get_llm
from api.settings import settings

logger = logging.getLogger(__name__)



_SKILL_RULES = (
    "One technology/language/framework/library/tool per item. "
    "EXCLUDE: job titles, soft skills, company names, education, "
    "and anything marked as being learned ('изучаю', 'learning', 'в процессе'). "
    "Split slash- or plus-joined pairs into separate items: "
    "'HTML5/CSS3' → ['HTML5','CSS3'], 'Python/Go' → ['Python','Go']. "
    "Strip version numbers: 'React 18' → 'React'. "
    "Keep compound library names intact: 'Redux Toolkit', 'React Query'. "
    "No duplicates."
)


class ParsedData(BaseModel):
    resume_summary: str = Field(description="1-2 sentence summary of the candidate's profile")
    vacancy_summary: str = Field(description="1-2 sentence summary of the job requirements")
    resume_skills: list[str] = Field(
        description=(
            "All confirmed technical skills from the entire resume "
            "(work experience, skills section, project descriptions). " + _SKILL_RULES
        )
    )
    vacancy_skills: list[str] = Field(
        description=(
            "All technical skills the vacancy requires. "
            "For OR/или conditions include ALL options: "
            "'GitLab или GitHub Actions' → ['GitLab', 'GitHub Actions']. " + _SKILL_RULES
        )
    )
    vacancy_seniority_hint: str = Field(
        default="not specified",
        description='Seniority level required. Must be exactly one of: "junior", "middle", "senior", "not specified".',
    )

    @field_validator("vacancy_seniority_hint", mode="before")
    @classmethod
    def coerce_seniority(cls, v: object) -> str:
        """Normalize any model output to the 4 allowed values."""
        if not isinstance(v, str):
            return "not specified"
        normalized = v.lower().strip()
        if "junior" in normalized or normalized in ("jr", "entry"):
            return "junior"
        if "senior" in normalized or normalized in ("sr", "lead", "staff", "principal"):
            return "senior"
        if "middle" in normalized or normalized in ("mid", "intermediate", "medior"):
            return "middle"
        return "not specified"


PROMPT = ChatPromptTemplate.from_messages([
    ("system", (
        "You are a precise data extractor for an HR matching system. "
        "Your output is consumed by code — follow field descriptions exactly."
    )),
    ("human", """Extract structured information from the resume and vacancy below.

RESUME:
{resume}

VACANCY:
{vacancy}"""),
])


async def parse_node(state: dict[str, Any]) -> dict[str, Any]:
    resume = state["resume"][:settings.resume_context_limit]
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
