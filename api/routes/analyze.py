import json

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from api.agents.graph import build_graph
from api.clients.hh_client import get_vacancy_by_url
from api.db.models import Analysis, Session, get_session
from api.llm.streaming import event_stream

router = APIRouter(prefix="/api", tags=["analyze"])


class AnalyzeRequest(BaseModel):
    resume: str
    vacancy: str | None = None       # raw text
    vacancy_url: str | None = None   # hh.ru URL or vacancy ID
    mode: str = "seeker"             # seeker | hr


@router.post("/analyze")
async def analyze(
    body: AnalyzeRequest,
    db: AsyncSession = Depends(get_session),
) -> StreamingResponse:
    if not body.vacancy and not body.vacancy_url:
        raise HTTPException(status_code=422, detail="Provide either 'vacancy' text or 'vacancy_url'")

    # fetch vacancy from hh.ru if URL/ID is given
    if body.vacancy_url:
        try:
            vacancy_text, _ = await get_vacancy_by_url(body.vacancy_url)
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"Failed to fetch vacancy: {exc}")
    else:
        vacancy_text = body.vacancy  # type: ignore[assignment]

    session = Session(mode=body.mode)
    db.add(session)
    await db.flush()

    analysis = Analysis(
        session_id=session.id,
        resume_text=body.resume,
        vacancy_text=vacancy_text,
    )
    db.add(analysis)
    await db.commit()
    await db.refresh(analysis)

    graph = build_graph()

    async def generate():
        result = None
        async for chunk, state in event_stream(graph, body.resume, vacancy_text):
            yield chunk
            result = state

        if result:
            analysis.match_score = result.get("match_score")
            analysis.seniority = result.get("seniority")
            analysis.seniority_confidence = result.get("seniority_confidence")
            analysis.skills_found = json.dumps(result.get("skills_found", []))
            analysis.skills_missing = json.dumps(result.get("skills_missing", []))
            analysis.llm_response = result.get("llm_response", "")
            await db.commit()

    return StreamingResponse(generate(), media_type="text/event-stream")
