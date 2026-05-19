import asyncio
import json

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from api.agents.graph import build_graph
from api.agents.nodes.parse import PROMPT, ParsedData
from api.clients.vacancy_search import SearchFilters, get_search_provider
from api.llm.provider import get_llm
from api.llm.streaming import run_graph, sse_encode

router = APIRouter(prefix="/api", tags=["seek"])

_RESUME_LIMIT = 4000


class SeekRequest(BaseModel):
    resume: str
    job_title: str = ""              # если пусто — строим из скиллов резюме
    area: int = 1                    # 1=Москва, 2=СПб, 113=вся Россия
    experience: str | None = None
    salary_from: int | None = None
    remote: bool = False
    count: int = 10                  # сколько вакансий анализировать


@router.post("/seek")
async def seek_vacancies(body: SeekRequest) -> StreamingResponse:
    async def generate():
        queue: asyncio.Queue[dict | None] = asyncio.Queue()

        async def worker() -> None:
            try:
                # 1. Парсим резюме — достаём скиллы и уровень
                await queue.put({"event": "status", "message": "Анализируем резюме…"})
                llm = get_llm()
                chain = PROMPT | llm.with_structured_output(ParsedData)
                try:
                    parsed: ParsedData = await chain.ainvoke({
                        "resume": body.resume[:_RESUME_LIMIT],
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

                # 2. Ищем вакансии
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

                await queue.put({
                    "event": "search_done",
                    "total": len(items),
                    "query": query,
                })

                if not items:
                    await queue.put({"event": "done", "total": 0})
                    await queue.put(None)
                    return

                # 3. Анализируем параллельно, стримим результаты по мере готовности
                await queue.put({
                    "event": "status",
                    "message": f"Анализируем {len(items)} вакансий…",
                })
                graph = build_graph()

                async def analyze_one(item) -> None:
                    try:
                        state = await run_graph(graph, body.resume, item.text, mode="seeker")
                        score = state.get("match_score", 0.0)
                        if score >= 0.75:
                            decision = "strong_match"
                        elif score >= 0.5:
                            decision = "worth_considering"
                        else:
                            decision = "weak_match"
                        await queue.put({
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
                        })
                    except Exception as exc:
                        await queue.put({
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
                            "explanation": f"Analysis error: {exc}",
                        })

                await asyncio.gather(*[analyze_one(i) for i in items])
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
