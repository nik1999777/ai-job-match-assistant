import json
from typing import Any, AsyncGenerator


async def event_stream(
    graph,
    resume: str,
    vacancy: str,
) -> AsyncGenerator[tuple[bytes, dict[str, Any]], None]:
    initial_state: dict[str, Any] = {"resume": resume, "vacancy": vacancy}
    final_state: dict[str, Any] = {}

    _NODE_NAMES = {"parse_node", "gap_node", "advise_node"}

    async for event in graph.astream_events(initial_state, version="v2"):
        kind: str = event["event"]
        name: str = event.get("name", "")

        if kind == "on_chain_start" and name in _NODE_NAMES:
            data = json.dumps({"event": "node_start", "node": name})
            yield _sse(data), final_state

        elif kind == "on_chat_model_stream":
            chunk = event["data"].get("chunk")
            if chunk and getattr(chunk, "content", None):
                data = json.dumps({"event": "token", "content": chunk.content})
                yield _sse(data), final_state

        elif kind == "on_chain_end" and name in _NODE_NAMES:
            output = event["data"].get("output", {})
            if isinstance(output, dict):
                final_state.update(output)
            data = json.dumps({"event": "node_done", "node": name})
            yield _sse(data), final_state

    data = json.dumps({"event": "done", "state": _serialisable(final_state)})
    yield _sse(data), final_state


def _sse(payload: str) -> bytes:
    return f"data: {payload}\n\n".encode()


def _serialisable(state: dict[str, Any]) -> dict[str, Any]:
    safe: dict[str, Any] = {}
    for k, v in state.items():
        try:
            json.dumps(v)
            safe[k] = v
        except (TypeError, ValueError):
            safe[k] = str(v)
    return safe
