from typing import Any, Literal

from langchain_core.prompts import ChatPromptTemplate
from pydantic import BaseModel, Field

from api.llm.language import detect_language
from api.llm.provider import get_llm


class SkillTip(BaseModel):
    skill: str = Field(description="The missing skill name")
    action: str = Field(description="Concrete learning action or resource, 1 sentence")


class SeekerAdvice(BaseModel):
    overall: str = Field(description="2 sentences on candidate fit. If match <40%, state it's a stretch role. If seniority mismatch, name it explicitly.")
    top_skills: list[SkillTip] = Field(default_factory=list, description="Up to 3 most critical missing skills with concrete actions. Empty list if no missing skills.")
    resume_tips: list[str] = Field(default_factory=list, description="Up to 2 specific resume edits to better target this vacancy.")
    strategy: str = Field(description="1-2 sentences on how to position this application given the match score and seniority.")


class HRAdvice(BaseModel):
    candidate_fit: str = Field(description="2 sentences on match quality and seniority alignment.")
    strengths: list[str] = Field(default_factory=list, description="Up to 3 skills or experiences that directly match the role.")
    gaps: list[str] = Field(default_factory=list, description="Up to 3 missing skills or experiences that matter for this role.")
    decision: Literal["Hire", "Borderline", "No Hire"] = Field(description="Hiring recommendation based on the data.")
    decision_reason: str = Field(description="1 sentence justification for the decision.")


_SEEKER_PROMPT = ChatPromptTemplate.from_messages([
    ("system", (
        "You are an expert career advisor. Give concrete, actionable advice grounded strictly in the data. "
        "No filler phrases. Respond entirely in {language}."
    )),
    ("human", """Resume: {resume_summary}
Vacancy: {vacancy_summary}

Match: {match_score} | Seniority: {seniority} (confidence: {seniority_confidence})
Skills found: {skills_found}
Skills missing: {skills_missing}
Market context: {similar_context}"""),
])

_HR_PROMPT = ChatPromptTemplate.from_messages([
    ("system", (
        "You are a senior technical recruiter. Give evidence-based assessment. No filler phrases. "
        "Respond entirely in {language}."
    )),
    ("human", """Resume: {resume_summary}
Vacancy: {vacancy_summary}

Match: {match_score} | Seniority: {seniority} (confidence: {seniority_confidence})
Skills found: {skills_found}
Skills missing: {skills_missing}"""),
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

    schema = SeekerAdvice if mode != "hr" else HRAdvice
    prompt = _SEEKER_PROMPT if mode != "hr" else _HR_PROMPT
    chain = prompt | get_llm().with_structured_output(schema)

    shared = {
        "language": language,
        "resume_summary": parsed.get("resume_summary", "—"),
        "vacancy_summary": parsed.get("vacancy_summary", "—"),
        "match_score": f"{state.get('match_score', 0):.1%}",
        "seniority": state.get("seniority", "unknown"),
        "seniority_confidence": f"{state.get('seniority_confidence', 0.0):.0%}",
        "skills_found": ", ".join(state.get("skills_found", [])) or "none",
        "skills_missing": ", ".join(state.get("skills_missing", [])) or "none",
    }
    if mode != "hr":
        shared["similar_context"] = similar_context

    result: SeekerAdvice | HRAdvice = await chain.ainvoke(shared)

    return {**state, "llm_response": result.model_dump()}
