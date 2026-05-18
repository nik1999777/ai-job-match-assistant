from typing import Any

from langchain_core.prompts import ChatPromptTemplate

from api.llm.provider import get_llm

PROMPT = ChatPromptTemplate.from_messages([
    ("system", "You are a structured data extractor. Return JSON only."),
    ("human", """Extract structured information from the resume and vacancy below.

RESUME:
{resume}

VACANCY:
{vacancy}

Return JSON with keys:
- resume_summary: 1-2 sentences
- vacancy_summary: 1-2 sentences
- resume_skills: list of technical skills mentioned
- vacancy_skills: list of technical skills required
- vacancy_seniority_hint: junior | middle | senior | not specified"""),
])


async def parse_node(state: dict[str, Any]) -> dict[str, Any]:
    llm = get_llm()
    chain = PROMPT | llm
    result = await chain.ainvoke({
        "resume": state["resume"],
        "vacancy": state["vacancy"],
    })
    import json, re
    raw = result.content
    # strip markdown code fences if present
    raw = re.sub(r"```(?:json)?", "", raw).strip().rstrip("```").strip()
    parsed = json.loads(raw)
    return {**state, "parsed": parsed}
