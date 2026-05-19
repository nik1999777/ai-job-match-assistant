import asyncio

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from api.agents.graph import build_graph
from api.llm.streaming import run_graph

router = APIRouter(prefix="/api", tags=["batch"])

_MAX_BATCH_SIZE = 20


class ResumeItem(BaseModel):
    candidate_id: str
    resume: str


class BatchRequest(BaseModel):
    vacancy: str
    resumes: list[ResumeItem]


class CandidateResult(BaseModel):
    candidate_id: str
    match_score: float
    decision: str          # hire | no_hire | borderline
    seniority: str
    skills_found: list[str]
    skills_missing: list[str]
    explanation: str


class BatchResponse(BaseModel):
    results: list[CandidateResult]


@router.post("/batch", response_model=BatchResponse)
async def batch_analyze(body: BatchRequest) -> BatchResponse:
    if len(body.resumes) > _MAX_BATCH_SIZE:
        raise HTTPException(
            status_code=422,
            detail=f"Max {_MAX_BATCH_SIZE} resumes per batch request",
        )

    graph = build_graph()

    async def analyze_one(item: ResumeItem) -> CandidateResult:
        state = await run_graph(graph, item.resume, body.vacancy, mode="hr")
        score = state.get("match_score", 0.0)
        if score >= 0.75:
            decision = "hire"
        elif score >= 0.5:
            decision = "borderline"
        else:
            decision = "no_hire"
        return CandidateResult(
            candidate_id=item.candidate_id,
            match_score=round(score, 2),
            decision=decision,
            seniority=state.get("seniority", "unknown"),
            skills_found=state.get("skills_found", []),
            skills_missing=state.get("skills_missing", []),
            explanation=state.get("llm_response", ""),
        )

    results = await asyncio.gather(*[analyze_one(r) for r in body.resumes])
    ranked = sorted(results, key=lambda x: x.match_score, reverse=True)
    return BatchResponse(results=ranked)
