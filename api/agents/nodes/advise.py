from typing import Any

from langchain_core.prompts import ChatPromptTemplate

from api.llm.provider import get_llm

PROMPT = ChatPromptTemplate.from_messages([
    ("system", (
        "You are an expert career advisor. "
        "Give concrete, actionable advice tailored to the specific gap analysis provided."
    )),
    ("human", """Analyze the job match and provide structured advice.

RESUME SUMMARY: {resume_summary}
VACANCY SUMMARY: {vacancy_summary}
MATCH SCORE: {match_score}
SENIORITY: {seniority} (confidence: {seniority_confidence})

MATCHING SKILLS: {skills_found}
MISSING SKILLS: {skills_missing}

SIMILAR VACANCIES ON MARKET:
{similar_context}

Respond with four sections:
## Overall Assessment
2-3 sentences on fit and biggest opportunity.

## Top Skills to Develop
List the 3 most impactful missing skills with a concrete learning path for each.

## Resume Improvements
Specific bullet-level edits to better match the vacancy.

## Application Strategy
How to position this application given the gap."""),
])


async def advise_node(state: dict[str, Any]) -> dict[str, Any]:
    parsed = state.get("parsed", {})
    similar = state.get("similar_vacancies", [])

    similar_context = "\n".join(
        "- {title}: {skills}".format(
            title=v.get("title", "Vacancy"),
            skills=", ".join(v.get("skills", [])[:5]) or "n/a",
        )
        for v in similar[:3]
    ) or "No similar vacancies retrieved."

    llm = get_llm()
    chain = PROMPT | llm

    result = await chain.ainvoke({
        "resume_summary": parsed.get("resume_summary", "—"),
        "vacancy_summary": parsed.get("vacancy_summary", "—"),
        "match_score": f"{state.get('match_score', 0):.1%}",
        "seniority": state.get("seniority", "unknown"),
        "seniority_confidence": f"{state.get('seniority_confidence', 0.0):.0%}",
        "skills_found": ", ".join(state.get("skills_found", [])) or "none",
        "skills_missing": ", ".join(state.get("skills_missing", [])) or "none",
        "similar_context": similar_context,
    })

    return {**state, "llm_response": result.content}
