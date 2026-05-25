from typing import Any

from langchain_core.prompts import ChatPromptTemplate

from api.llm.language import detect_language
from api.llm.provider import get_llm

_SEEKER_PROMPT = ChatPromptTemplate.from_messages([
    ("system", (
        "You are an expert career advisor. "
        "Give concrete, actionable advice grounded strictly in the provided data. "
        "Respond entirely in {language}. All section headings must also be in {language}."
    )),
    ("human", """You have the following job match analysis. Use all data provided.

RESUME SUMMARY: {resume_summary}
VACANCY SUMMARY: {vacancy_summary}

MATCH SCORE: {match_score} | SENIORITY: {seniority} (confidence: {seniority_confidence})
MATCHING SKILLS: {skills_found}
MISSING SKILLS: {skills_missing}

SIMILAR ROLES ON MARKET:
{similar_context}

Write four sections. Be specific — no generic advice.

## Overall Assessment
2-3 sentences on fit. If match score is below 40%, explicitly state this is a stretch role.
If there is a seniority mismatch (e.g. junior applying for senior), name it clearly.

## Top Skills to Develop
The 3 most critical missing skills with a concrete learning resource or action for each.
Skip this section if there are no missing skills.

## Resume Improvements
2-3 specific edits to better target this vacancy.

## Application Strategy
How to position this application given the match score and seniority level."""),
])

_HR_PROMPT = ChatPromptTemplate.from_messages([
    ("system", (
        "You are a senior technical recruiter. "
        "Give a structured, evidence-based assessment. No filler phrases. "
        "Respond entirely in {language}. All section headings must also be in {language}."
    )),
    ("human", """Assess this candidate against the vacancy. Use the data provided.

RESUME SUMMARY: {resume_summary}
VACANCY SUMMARY: {vacancy_summary}

MATCH SCORE: {match_score} | SENIORITY: {seniority} (confidence: {seniority_confidence})
MATCHING SKILLS: {skills_found}
MISSING SKILLS: {skills_missing}

SIMILAR ROLES ON MARKET:
{similar_context}

Write four sections.

## Candidate Fit
1-2 sentences. State the match score and whether seniority aligns.

## Strengths
Skills and experience that directly match the role requirements.

## Gaps
Missing skills or experience that matter for this role. Be specific.

## Hiring Recommendation
One of: **Hire** / **Borderline** / **No Hire** — one sentence justification based on the data."""),
])


async def advise_node(state: dict[str, Any]) -> dict[str, Any]:
    parsed = state.get("parsed", {})
    similar = state.get("similar_vacancies", [])
    mode = state.get("mode", "seeker")

    language = detect_language(state.get("resume", ""))

    similar_context = "\n".join(
        "- {title}: {skills}".format(
            title=v.get("title", "Vacancy"),
            skills=", ".join(v.get("skills", [])[:5]) or "n/a",
        )
        for v in similar[:3]
    ) or "No similar vacancies retrieved."

    prompt = _HR_PROMPT if mode == "hr" else _SEEKER_PROMPT
    chain = prompt | get_llm()

    result = await chain.ainvoke({
        "language": language,
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
