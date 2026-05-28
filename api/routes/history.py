import json

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from api.auth.deps import current_user_required
from api.db.models import Analysis, BatchSession, SeekSession, Session, User, get_session

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
    vacancy_url: str | None
    match_score: float | None
    seniority: str | None
    seniority_confidence: float | None
    skills_found: list[str]
    skills_missing: list[str]
    llm_response: str | None
    decision: str | None


class CandidateResult(BaseModel):
    candidate_id: str
    match_score: float
    decision: str
    seniority: str
    skills_found: list[str]
    skills_missing: list[str]
    explanation: str


class BatchSummary(BaseModel):
    id: int
    created_at: str
    vacancy_snippet: str
    candidate_count: int
    hire_count: int
    borderline_count: int
    no_hire_count: int


class BatchHistoryResponse(BaseModel):
    items: list[BatchSummary]
    total: int
    page: int
    limit: int


class BatchDetail(BaseModel):
    id: int
    created_at: str
    vacancy_text: str
    candidate_count: int
    results: list[CandidateResult]


def _snippet(text: str, length: int = 80) -> str:
    return text[:length] + "…" if len(text) > length else text


def _parse_skills(raw: str | None) -> list[str]:
    if not raw:
        return []
    try:
        return json.loads(raw)
    except (ValueError, TypeError):
        return []


def _parse_results(raw: str) -> list[CandidateResult]:
    try:
        data = json.loads(raw)
        return [CandidateResult(**item) for item in data]
    except Exception:
        return []


@router.get("/history", response_model=HistoryResponse)
async def get_history(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    mode: str | None = Query(None),
    db: AsyncSession = Depends(get_session),
    user: User = Depends(current_user_required),
):
    offset = (page - 1) * limit

    base_where = [Session.user_id == user.id]
    if mode:
        base_where.append(Session.mode == mode)

    total_result = await db.execute(
        select(func.count(Analysis.id))
        .join(Session, Analysis.session_id == Session.id)
        .where(*base_where)
    )
    total = total_result.scalar_one()

    result = await db.execute(
        select(Analysis, Session.mode)
        .join(Session, Analysis.session_id == Session.id)
        .where(*base_where)
        .order_by(Analysis.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    rows = result.all()

    items = [
        AnalysisSummary(
            id=analysis.id,
            created_at=analysis.created_at.isoformat(),
            mode=mode_val,
            resume_snippet=_snippet(analysis.resume_text),
            vacancy_snippet=_snippet(analysis.vacancy_text),
            match_score=analysis.match_score,
            seniority=analysis.seniority,
            skills_found=_parse_skills(analysis.skills_found),
            skills_missing=_parse_skills(analysis.skills_missing),
            decision=analysis.decision.value if analysis.decision else None,
        )
        for analysis, mode_val in rows
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
        vacancy_url=analysis.vacancy_url,
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


@router.get("/batch-history", response_model=BatchHistoryResponse)
async def get_batch_history(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_session),
    user: User = Depends(current_user_required),
):
    offset = (page - 1) * limit

    total_result = await db.execute(
        select(func.count(BatchSession.id)).where(BatchSession.user_id == user.id)
    )
    total = total_result.scalar_one()

    result = await db.execute(
        select(BatchSession)
        .where(BatchSession.user_id == user.id)
        .order_by(BatchSession.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    sessions = result.scalars().all()

    items = []
    for s in sessions:
        results = _parse_results(s.results)
        items.append(BatchSummary(
            id=s.id,
            created_at=s.created_at.isoformat(),
            vacancy_snippet=_snippet(s.vacancy_text),
            candidate_count=s.candidate_count,
            hire_count=sum(1 for r in results if r.decision == "hire"),
            borderline_count=sum(1 for r in results if r.decision == "borderline"),
            no_hire_count=sum(1 for r in results if r.decision == "no_hire"),
        ))

    return BatchHistoryResponse(items=items, total=total, page=page, limit=limit)


@router.get("/batch-history/{session_id}", response_model=BatchDetail)
async def get_batch_detail(
    session_id: int,
    db: AsyncSession = Depends(get_session),
    user: User = Depends(current_user_required),
):
    result = await db.execute(
        select(BatchSession).where(
            BatchSession.id == session_id,
            BatchSession.user_id == user.id,
        )
    )
    s = result.scalar_one_or_none()
    if not s:
        raise HTTPException(status_code=404, detail="Batch session not found")

    return BatchDetail(
        id=s.id,
        created_at=s.created_at.isoformat(),
        vacancy_text=s.vacancy_text,
        candidate_count=s.candidate_count,
        results=_parse_results(s.results),
    )


@router.delete("/batch-history/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_batch_session(
    session_id: int,
    db: AsyncSession = Depends(get_session),
    user: User = Depends(current_user_required),
):
    result = await db.execute(
        select(BatchSession).where(
            BatchSession.id == session_id,
            BatchSession.user_id == user.id,
        )
    )
    s = result.scalar_one_or_none()
    if not s:
        raise HTTPException(status_code=404, detail="Batch session not found")

    await db.delete(s)
    await db.commit()


# ── Seek history ──────────────────────────────────────────────────────────────

class VacancyResult(BaseModel):
    vacancy_id: str
    title: str
    company: str
    url: str
    salary_str: str | None
    match_score: float
    decision: str
    skills_found: list[str]
    skills_missing: list[str]
    explanation: str


class SeekSummary(BaseModel):
    id: int
    created_at: str
    job_title: str
    result_count: int
    strong_count: int
    considering_count: int
    weak_count: int


class SeekHistoryResponse(BaseModel):
    items: list[SeekSummary]
    total: int
    page: int
    limit: int


class SeekDetail(BaseModel):
    id: int
    created_at: str
    job_title: str
    result_count: int
    results: list[VacancyResult]


def _parse_seek_results(raw: str) -> list[VacancyResult]:
    try:
        data = json.loads(raw)
        return [VacancyResult(**item) for item in data]
    except Exception:
        return []


@router.get("/seek-history", response_model=SeekHistoryResponse)
async def get_seek_history(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_session),
    user: User = Depends(current_user_required),
):
    offset = (page - 1) * limit

    total_result = await db.execute(
        select(func.count(SeekSession.id)).where(SeekSession.user_id == user.id)
    )
    total = total_result.scalar_one()

    result = await db.execute(
        select(SeekSession)
        .where(SeekSession.user_id == user.id)
        .order_by(SeekSession.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    sessions = result.scalars().all()

    items = []
    for s in sessions:
        results = _parse_seek_results(s.results)
        items.append(SeekSummary(
            id=s.id,
            created_at=s.created_at.isoformat(),
            job_title=s.job_title,
            result_count=s.result_count,
            strong_count=sum(1 for r in results if r.decision == "strong_match"),
            considering_count=sum(1 for r in results if r.decision == "worth_considering"),
            weak_count=sum(1 for r in results if r.decision == "weak_match"),
        ))

    return SeekHistoryResponse(items=items, total=total, page=page, limit=limit)


@router.get("/seek-history/{session_id}", response_model=SeekDetail)
async def get_seek_detail(
    session_id: int,
    db: AsyncSession = Depends(get_session),
    user: User = Depends(current_user_required),
):
    result = await db.execute(
        select(SeekSession).where(
            SeekSession.id == session_id,
            SeekSession.user_id == user.id,
        )
    )
    s = result.scalar_one_or_none()
    if not s:
        raise HTTPException(status_code=404, detail="Seek session not found")

    return SeekDetail(
        id=s.id,
        created_at=s.created_at.isoformat(),
        job_title=s.job_title,
        result_count=s.result_count,
        results=_parse_seek_results(s.results),
    )


@router.delete("/seek-history/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_seek_session(
    session_id: int,
    db: AsyncSession = Depends(get_session),
    user: User = Depends(current_user_required),
):
    result = await db.execute(
        select(SeekSession).where(
            SeekSession.id == session_id,
            SeekSession.user_id == user.id,
        )
    )
    s = result.scalar_one_or_none()
    if not s:
        raise HTTPException(status_code=404, detail="Seek session not found")

    await db.delete(s)
    await db.commit()
