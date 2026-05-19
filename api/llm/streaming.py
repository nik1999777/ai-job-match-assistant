import json
from typing import Any, AsyncGenerator


async def event_stream(
    graph,
    resume: str,
    vacancy: str,
    mode: str = "seeker",
) -> AsyncGenerator[tuple[bytes, dict[str, Any]], None]:
    initial_state: dict[str, Any] = {"resume": resume, "vacancy": vacancy, "mode": mode}
    final_state: dict[str, Any] = {}

    _NODE_NAMES = {"parse_node", "gap_node", "advise_node"}
    _current_node: str | None = None

    async for event in graph.astream_events(initial_state, version="v2"):
        kind: str = event["event"]
        name: str = event.get("name", "")

        if kind == "on_chain_start" and name in _NODE_NAMES:
            _current_node = name
            data = json.dumps({"event": "node_start", "node": name})
            yield _sse(data), final_state

        elif kind == "on_chat_model_stream" and _current_node == "advise_node":
            # only stream tokens from the advice node — parse_node returns JSON, not prose
            chunk = event["data"].get("chunk")
            if chunk and getattr(chunk, "content", None):
                data = json.dumps({"event": "token", "content": chunk.content})
                yield _sse(data), final_state

        elif kind == "on_chain_end" and name in _NODE_NAMES:
            _current_node = None
            output = event["data"].get("output", {})
            if isinstance(output, dict):
                final_state.update(output)

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


async def run_graph(graph, resume: str, vacancy: str, mode: str = "seeker") -> dict[str, Any]:
    final_state: dict[str, Any] = {}
    async for _, state in event_stream(graph, resume, vacancy, mode=mode):
        final_state = state
    return final_state


def sse_encode(payload: str) -> bytes:
    return f"data: {payload}\n\n".encode()


# backwards-compat alias used internally
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


def _serialisable_list(items: list[Any]) -> list[Any]:
    result = []
    for item in items:
        try:
            json.dumps(item)
            result.append(item)
        except (TypeError, ValueError):
            result.append(str(item))
    return result
