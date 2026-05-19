import json
import logging
import re
from typing import Any

from langchain_core.prompts import ChatPromptTemplate

from api.llm.provider import get_llm

logger = logging.getLogger(__name__)

# llama3 via Ollama has a 8k context window; cap inputs to stay well within it
_RESUME_LIMIT = 4000
_VACANCY_LIMIT = 2000

PROMPT = ChatPromptTemplate.from_messages([
    ("system", "You are a structured data extractor. Return JSON only, no other text."),
    ("human", """Extract structured information from the resume and vacancy below.

RESUME:
{resume}

VACANCY:
{vacancy}

Return a JSON object with exactly these keys:
- resume_summary: 1-2 sentences
- vacancy_summary: 1-2 sentences
- resume_skills: list of technical skills mentioned
- vacancy_skills: list of technical skills required
- vacancy_seniority_hint: junior | middle | senior | not specified"""),
])


def _extract_json(raw: str) -> dict[str, Any]:
    """Extract first JSON object from LLM output, even if surrounded by text."""
    # strip code fences first
    cleaned = re.sub(r"```(?:json)?```", "", raw, flags=re.DOTALL)
    cleaned = re.sub(r"```(?:json)?", "", cleaned).replace("```", "")

    match = re.search(r"\{.*\}", cleaned, re.DOTALL)
    if not match:
        logger.warning("parse_node: no JSON object found in LLM output: %r", raw[:200])
        return {}
    try:
        return json.loads(match.group())
    except json.JSONDecodeError as e:
        logger.warning("parse_node: JSON decode failed (%s). Raw: %r", e, raw[:200])
        return {}


async def parse_node(state: dict[str, Any]) -> dict[str, Any]:
    resume = state["resume"][:_RESUME_LIMIT]
    vacancy = state["vacancy"][:_VACANCY_LIMIT]

    llm = get_llm()
    chain = PROMPT | llm
    result = await chain.ainvoke({"resume": resume, "vacancy": vacancy})

    parsed = _extract_json(result.content)
    return {**state, "parsed": parsed}
