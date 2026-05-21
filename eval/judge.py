import logging
from typing import Any

from langchain_core.prompts import ChatPromptTemplate
from langchain_openai import ChatOpenAI
from pydantic import BaseModel, Field

from api.settings import settings

logger = logging.getLogger(__name__)

_JUDGE_MODEL = "gpt-4o-mini"


class JudgeScore(BaseModel):
    relevance: int = Field(ge=1, le=5, description=(
        "1=advice ignores the actual vacancy/resume, 5=advice is precisely tailored to both"
    ))
    actionability: int = Field(ge=1, le=5, description=(
        "1=vague generic advice, 5=concrete next steps the candidate can start today"
    ))
    accuracy: int = Field(ge=1, le=5, description=(
        "1=skill gaps are wrong or missing, 5=all critical gaps correctly identified"
    ))
    faithfulness: int = Field(ge=1, le=5, description=(
        "1=advice contains claims not grounded in the resume/vacancy texts (hallucination), "
        "5=every claim is directly supported by the provided texts"
    ))
    reasoning: str = Field(description="2-3 sentence explanation of all four scores")


_PROMPT = ChatPromptTemplate.from_messages([
    ("system", (
        "You are an expert HR evaluator assessing the quality of an AI career advisor's output. "
        "Be critical and precise. Score each criterion 1-5 based on the rubric in the schema."
    )),
    ("human", """Evaluate the AI advisor's response for this resume+vacancy pair.

RESUME:
{resume}

VACANCY:
{vacancy}

AI ADVISOR OUTPUT:
{advice}

SKILL GAPS IDENTIFIED BY THE SYSTEM:
- Found in resume: {skills_found}
- Missing from resume: {skills_missing}
- Match score: {match_score}

Score the advice on all four criteria (1-5 each).
Pay special attention to faithfulness: flag any claim in the advice that is NOT grounded in the resume or vacancy text."""),
])


async def judge_advice(
    resume: str,
    vacancy: str,
    state: dict[str, Any],
) -> JudgeScore | None:
    if not settings.openai_api_key:
        logger.warning("judge_advice: no openai_api_key, skipping LLM judge")
        return None

    llm = ChatOpenAI(
        model=_JUDGE_MODEL,
        temperature=0.0,
        api_key=settings.openai_api_key,
    )
    chain = _PROMPT | llm.with_structured_output(JudgeScore)

    try:
        return await chain.ainvoke({
            "resume": resume,
            "vacancy": vacancy,
            "advice": state.get("llm_response", ""),
            "skills_found": state.get("skills_found", []),
            "skills_missing": state.get("skills_missing", []),
            "match_score": state.get("match_score", 0),
        })
    except Exception as exc:
        logger.error("judge_advice failed: %s", exc)
        return None
