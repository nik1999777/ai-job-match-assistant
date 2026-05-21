import json

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from api.auth.deps import current_user_required
from api.db.models import Analysis, Session, User, get_session

router = APIRouter(prefix="/api", tags=["history"])


class AnalysisSummary(BaseModel):
    id: int
    created_at: str
    mode: str
    resume_snippet: str
    vacancy_snippet: str
    match_score: float | None
    seniority: str | None
    skills_found: list[str]
    skills_missing: list[str]
    decision: str | None


class HistoryResponse(BaseModel):
    items: list[AnalysisSummary]
    total: int
    page: int
    limit: int


class AnalysisDetail(BaseModel):
    id: int
    created_at: str
    mode: str
    resume_text: str
    vacancy_text: str
    match_score: float | None
    seniority: str | None
    seniority_confidence: float | None
    skills_found: list[str]
    skills_missing: list[str]
    llm_response: str | None
    decision: str | None


def _snippet(text: str, length: int = 80) -> str:
    return text[:length] + "…" if len(text) > length else text


def _parse_skills(raw: str | None) -> list[str]:
    if not raw:
        return []
    try:
        return json.loads(raw)
    except (ValueError, TypeError):
        return []


@router.get("/history", response_model=HistoryResponse)
async def get_history(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_session),
    user: User = Depends(current_user_required),
):
    offset = (page - 1) * limit

    total_result = await db.execute(
        select(func.count(Analysis.id))
        .join(Session, Analysis.session_id == Session.id)
        .where(Session.user_id == user.id)
    )
    total = total_result.scalar_one()

    result = await db.execute(
        select(Analysis, Session.mode)
        .join(Session, Analysis.session_id == Session.id)
        .where(Session.user_id == user.id)
        .order_by(Analysis.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    rows = result.all()

    items = [
        AnalysisSummary(
            id=analysis.id,
            created_at=analysis.created_at.isoformat(),
            mode=mode,
            resume_snippet=_snippet(analysis.resume_text),
            vacancy_snippet=_snippet(analysis.vacancy_text),
            match_score=analysis.match_score,
            seniority=analysis.seniority,
            skills_found=_parse_skills(analysis.skills_found),
            skills_missing=_parse_skills(analysis.skills_missing),
            decision=analysis.decision.value if analysis.decision else None,
        )
        for analysis, mode in rows
    ]

    return HistoryResponse(items=items, total=total, page=page, limit=limit)


@router.get("/analyses/{analysis_id}", response_model=AnalysisDetail)
async def get_analysis(
    analysis_id: int,
    db: AsyncSession = Depends(get_session),
    user: User = Depends(current_user_required),
):
    result = await db.execute(
        select(Analysis, Session.mode)
        .join(Session, Analysis.session_id == Session.id)
        .where(Analysis.id == analysis_id, Session.user_id == user.id)
    )
    row = result.first()
    if not row:
        raise HTTPException(status_code=404, detail="Analysis not found")

    analysis, mode = row
    return AnalysisDetail(
        id=analysis.id,
        created_at=analysis.created_at.isoformat(),
        mode=mode,
        resume_text=analysis.resume_text,
        vacancy_text=analysis.vacancy_text,
        match_score=analysis.match_score,
        seniority=analysis.seniority,
        seniority_confidence=analysis.seniority_confidence,
        skills_found=_parse_skills(analysis.skills_found),
        skills_missing=_parse_skills(analysis.skills_missing),
        llm_response=analysis.llm_response,
        decision=analysis.decision.value if analysis.decision else None,
    )


@router.delete("/analyses/{analysis_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_analysis(
    analysis_id: int,
    db: AsyncSession = Depends(get_session),
    user: User = Depends(current_user_required),
):
    result = await db.execute(
        select(Analysis)
        .join(Session, Analysis.session_id == Session.id)
        .where(Analysis.id == analysis_id, Session.user_id == user.id)
    )
    analysis = result.scalar_one_or_none()

    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not found")

    await db.delete(analysis)
    await db.commit()
