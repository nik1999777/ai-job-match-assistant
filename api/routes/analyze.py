import json

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from api.agents.graph import build_graph
from api.db.models import Analysis, Session, get_session
from api.llm.streaming import event_stream

router = APIRouter(prefix="/api", tags=["analyze"])


class AnalyzeRequest(BaseModel):
    resume: str
    vacancy: str
    mode: str = "seeker"  # seeker | hr


@router.post("/analyze")
async def analyze(
    body: AnalyzeRequest,
    db: AsyncSession = Depends(get_session),
) -> StreamingResponse:
    session = Session(mode=body.mode)
    db.add(session)
    await db.flush()

    analysis = Analysis(
        session_id=session.id,
        resume_text=body.resume,
        vacancy_text=body.vacancy,
    )
    db.add(analysis)
    await db.commit()
    await db.refresh(analysis)

    graph = build_graph()

    async def generate():
        result = None
        async for chunk, state in event_stream(graph, body.resume, body.vacancy):
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
