import json
import logging
import time
from functools import cache
from typing import Any, AsyncGenerator

logger = logging.getLogger(__name__)


@cache
def _langfuse_client():
    """Singleton — created once per process, reused across all requests."""
    from api.settings import settings
    if not settings.langfuse_public_key or not settings.langfuse_secret_key:
        return None
    try:
        from langfuse import Langfuse
        return Langfuse(
            public_key=settings.langfuse_public_key,
            secret_key=settings.langfuse_secret_key,
            host=settings.langfuse_host,
        )
    except Exception as exc:
        logger.warning("Langfuse client unavailable: %s", exc)
        return None


def _get_model_name() -> str:
    from api.settings import settings
    if settings.llm_provider == "ollama":
        return f"ollama/{settings.ollama_model}"
    if settings.llm_provider == "groq":
        return f"groq/{settings.groq_model}"
    return f"openai/{settings.openai_model}"


async def event_stream(
    graph,
    resume: str,
    vacancy: str,
    mode: str = "seeker",
    user_id: str | None = None,
    session_id: str | None = None,
) -> AsyncGenerator[tuple[bytes, dict[str, Any]], None]:
    initial_state: dict[str, Any] = {"resume": resume, "vacancy": vacancy, "mode": mode}
    final_state: dict[str, Any] = {}

    _NODE_NAMES = {"parse_node", "gap_node", "advise_node"}
    _current_node: str | None = None

    lf = _langfuse_client()
    trace = lf.trace(
        name="analyze_pipeline",
        input={
            "mode": mode,
            "resume_snippet": resume[:200],
            "vacancy_snippet": vacancy[:200],
        },
        metadata={"model": _get_model_name()},
        tags=[mode],
        user_id=user_id,
        session_id=session_id,
    ) if lf else None

    # per-node span tracking
    node_spans: dict[str, Any] = {}
    node_start_times: dict[str, float] = {}
    t0 = time.perf_counter()

    async for event in graph.astream_events(initial_state, version="v2"):
        kind: str = event["event"]
        name: str = event.get("name", "")

        if kind == "on_chain_start" and name in _NODE_NAMES:
            _current_node = name
            node_start_times[name] = time.perf_counter()
            if trace:
                node_input = event["data"].get("input", {})
                trimmed_input = _trim_state(node_input) if isinstance(node_input, dict) else str(node_input)
                if name == "advise_node":
                    # generation() = LLM call — tracks model, tokens, cost in Langfuse Generations tab
                    node_spans[name] = trace.generation(
                        name=name,
                        model=_get_model_name(),
                        input=trimmed_input,
                    )
                else:
                    node_spans[name] = trace.span(name=name, input=trimmed_input)
            data = json.dumps({"event": "node_start", "node": name})
            yield _sse(data), final_state

        elif kind == "on_chat_model_stream" and _current_node == "advise_node":
            chunk = event["data"].get("chunk")
            if chunk and getattr(chunk, "content", None):
                data = json.dumps({"event": "token", "content": chunk.content})
                yield _sse(data), final_state

        elif kind == "on_chain_end" and name in _NODE_NAMES:
            _current_node = None
            output = event["data"].get("output", {})
            if isinstance(output, dict):
                final_state.update(output)

            if trace and name in node_spans:
                node_latency = round((time.perf_counter() - node_start_times[name]) * 1000)
                if name == "advise_node":
                    node_spans[name].end(
                        output=output.get("llm_response", "") if isinstance(output, dict) else str(output),
                        metadata={"latency_ms": node_latency},
                    )
                else:
                    node_spans[name].end(
                        output=_trim_state(output) if isinstance(output, dict) else str(output),
                        metadata={"latency_ms": node_latency},
                    )

            if name == "parse_node":
                payload = json.dumps({
                    "event": "parsed_data",
                    "data": _serialisable(output.get("parsed", {})),
                    "raw_resume": output.get("resume", ""),
                    "raw_vacancy": output.get("vacancy", ""),
                })
                yield _sse(payload), final_state

            elif name == "gap_node":
                payload = json.dumps({
                    "event": "gap_data",
                    "skills_found": output.get("skills_found", []),
                    "skills_missing": output.get("skills_missing", []),
                    "match_score": output.get("match_score", 0),
                    "seniority": output.get("seniority", "unknown"),
                    "seniority_confidence": output.get("seniority_confidence", 0.0),
                    "similar_vacancies": _serialisable_list(output.get("similar_vacancies", [])),
                })
                yield _sse(payload), final_state

            data = json.dumps({"event": "node_done", "node": name})
            yield _sse(data), final_state

    data = json.dumps({"event": "done", "state": _serialisable(final_state)})
    yield _sse(data), final_state

    if trace:
        try:
            seniority = final_state.get("seniority", "unknown")
            seniority_confidence = final_state.get("seniority_confidence", 0.0)
            match_score = final_state.get("match_score")
            vacancy_hint = final_state.get("parsed", {}).get("vacancy_seniority_hint", "not specified")
            total_latency = round((time.perf_counter() - t0) * 1000)

            trace.update(
                output={
                    "match_score": match_score,
                    "seniority": seniority,
                    "seniority_confidence": round(seniority_confidence, 3),
                    "vacancy_seniority_hint": vacancy_hint,
                    "skills_missing": final_state.get("skills_missing", []),
                },
                metadata={
                    "model": _get_model_name(),
                    "latency_ms": total_latency,
                    "mode": mode,
                    "vacancy_seniority_hint": vacancy_hint,
                },
                tags=[mode, seniority],
            )

            if match_score is not None:
                trace.score(name="match_score", value=float(match_score))
            trace.score(name="seniority_confidence", value=round(float(seniority_confidence), 3))
            trace.score(name="latency_s", value=round(total_latency / 1000, 2))
            trace.score(name="skills_missing_count", value=float(len(final_state.get("skills_missing", []))))

            lf.flush()
        except Exception as exc:
            logger.warning("Langfuse flush failed: %s", exc)


async def run_graph(graph, resume: str, vacancy: str, mode: str = "seeker") -> dict[str, Any]:
    final_state: dict[str, Any] = {}
    async for _, state in event_stream(graph, resume, vacancy, mode=mode):
        final_state = state
    return final_state


def sse_encode(payload: str) -> bytes:
    return f"data: {payload}\n\n".encode()


_sse = sse_encode


def _serialisable(state: dict[str, Any]) -> dict[str, Any]:
    safe: dict[str, Any] = {}
    for k, v in state.items():
        try:
            json.dumps(v)
            safe[k] = v
        except (TypeError, ValueError):
            safe[k] = str(v)
    return safe


def _trim_state(state: dict[str, Any], max_str: int = 500) -> dict[str, Any]:
    """Truncate long string values so Langfuse spans stay readable."""
    result: dict[str, Any] = {}
    for k, v in state.items():
        if isinstance(v, str) and len(v) > max_str:
            result[k] = v[:max_str] + "…"
        else:
            result[k] = v
    return _serialisable(result)


def _serialisable_list(items: list[Any]) -> list[Any]:
    result = []
    for item in items:
        try:
            json.dumps(item)
            result.append(item)
        except (TypeError, ValueError):
            result.append(str(item))
    return result
