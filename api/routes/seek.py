import asyncio
import json
import logging

from fastapi import APIRouter, Depends

logger = logging.getLogger(__name__)
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from api.agents.graph import build_graph
from api.agents.nodes.parse import PROMPT, ParsedData
from api.auth.deps import current_user_optional
from api.clients.hh_client import get_vacancy, vacancy_to_text
from api.clients.vacancy_search import SearchFilters, format_salary, get_search_provider
from api.db.models import SeekSession, get_session
from api.llm.provider import get_llm
from api.llm.streaming import run_graph, sse_encode
from api.settings import settings  # match_score_hire_threshold, match_score_consider_threshold

router = APIRouter(prefix="/api", tags=["seek"])

_HH_SEM = asyncio.Semaphore(5)   # параллельные запросы к hh.ru API
_LLM_SEM = asyncio.Semaphore(3)  # параллельные LLM-вызовы (TPM лимит Groq)


class SeekRequest(BaseModel):
    resume: str
    job_title: str = ""
    area: int = 1
    experience: str | None = None
    salary_from: int | None = None
    remote: bool = False
    count: int = 10


@router.post("/seek")
async def seek_vacancies(
    body: SeekRequest,
    db: AsyncSession = Depends(get_session),
    user=Depends(current_user_optional),
) -> StreamingResponse:
    async def generate():
        queue: asyncio.Queue[dict | None] = asyncio.Queue()
        collected: list[dict] = []

        async def worker() -> None:
            try:
                await queue.put({"event": "status", "message": "Анализируем резюме…"})
                llm = get_llm()
                chain = PROMPT | llm.with_structured_output(ParsedData)
                try:
                    parsed: ParsedData = await chain.ainvoke({
                        "resume": body.resume[:settings.resume_context_limit],
                        "vacancy": body.job_title or "Software Engineer",
                    })
                    skills = parsed.resume_skills
                    seniority = parsed.vacancy_seniority_hint
                except Exception:
                    skills = []
                    seniority = "not specified"

                await queue.put({
                    "event": "resume_parsed",
                    "skills": skills,
                    "seniority": seniority,
                })

                query = body.job_title.strip() or " ".join(skills[:5]) or "Python Developer"
                await queue.put({"event": "status", "message": f"Ищем вакансии: «{query}»…"})

                provider = get_search_provider()
                filters = SearchFilters(
                    query=query,
                    area=body.area,
                    experience=body.experience,
                    salary_from=body.salary_from,
                    remote=body.remote,
                    count=min(body.count, 20),
                )
                items = await provider.search(filters)

                if not items:
                    await queue.put({"event": "done", "total": 0})
                    await queue.put(None)
                    return

                await queue.put({
                    "event": "status",
                    "message": f"Загружаем детали {len(items)} вакансий…",
                })

                async def enrich(item) -> None:
                    async with _HH_SEM:
                        try:
                            data = await get_vacancy(item.id)
                            item.text = vacancy_to_text(data)
                            item.salary_str = format_salary(data.get("salary"))
                        except Exception:
                            pass

                await asyncio.gather(*[enrich(i) for i in items])

                await queue.put({
                    "event": "search_done",
                    "total": len(items),
                    "query": query,
                })

                await queue.put({
                    "event": "status",
                    "message": f"Анализируем {len(items)} вакансий…",
                })
                graph = build_graph()

                async def analyze_one(item) -> None:
                    async with _LLM_SEM:
                        try:
                            state = await run_graph(graph, body.resume, item.text, mode="seeker")
                            score = state.get("match_score", 0.0)
                            if score >= settings.match_score_hire_threshold:
                                decision = "strong_match"
                            elif score >= settings.match_score_consider_threshold:
                                decision = "worth_considering"
                            else:
                                decision = "weak_match"
                            result = {
                                "event": "result",
                                "vacancy_id": item.id,
                                "title": item.title,
                                "company": item.company,
                                "url": item.url,
                                "salary_str": item.salary_str,
                                "match_score": round(score, 2),
                                "decision": decision,
                                "skills_found": state.get("skills_found", []),
                                "skills_missing": state.get("skills_missing", []),
                                "explanation": state.get("llm_response", ""),
                            }
                        except Exception as exc:
                            logger.warning("seek: analysis failed for vacancy %s: %s", item.id, exc)
                            result = {
                                "event": "result",
                                "vacancy_id": item.id,
                                "title": item.title,
                                "company": item.company,
                                "url": item.url,
                                "salary_str": item.salary_str,
                                "match_score": 0.0,
                                "decision": "weak_match",
                                "skills_found": [],
                                "skills_missing": [],
                                "explanation": "Analysis unavailable.",
                            }
                        collected.append(result)
                        await queue.put(result)

                await asyncio.gather(*[analyze_one(i) for i in items])

                if user and collected:
                    seek_session = SeekSession(
                        user_id=user.id,
                        job_title=query,
                        result_count=len(collected),
                        results=json.dumps(
                            [{k: v for k, v in r.items() if k != "event"} for r in collected],
                            ensure_ascii=False,
                        ),
                    )
                    db.add(seek_session)
                    await db.commit()

                await queue.put({"event": "done", "total": len(items)})

            except Exception as exc:
                await queue.put({"event": "error", "message": str(exc)})
            finally:
                await queue.put(None)

        asyncio.create_task(worker())

        while True:
            item = await queue.get()
            if item is None:
                break
            yield sse_encode(json.dumps(item, ensure_ascii=False))

    return StreamingResponse(generate(), media_type="text/event-stream")
