from typing import Any, TypedDict

from langgraph.graph import END, StateGraph

from api.agents.nodes.advise import advise_node
from api.agents.nodes.gap import gap_node
from api.agents.nodes.parse import parse_node


class JobMatchState(TypedDict, total=False):
    resume: str
    vacancy: str
    mode: str  # seeker | hr
    parsed: dict[str, Any]
    skills_found: list[str]
    skills_missing: list[str]
    match_score: float
    seniority: str
    seniority_confidence: float
    similar_vacancies: list[dict[str, Any]]
    llm_response: str


def build_graph():
    graph: StateGraph = StateGraph(JobMatchState)

    graph.add_node("parse_node", parse_node)
    graph.add_node("gap_node", gap_node)
    graph.add_node("advise_node", advise_node)

    graph.set_entry_point("parse_node")
    graph.add_edge("parse_node", "gap_node")
    graph.add_edge("gap_node", "advise_node")
    graph.add_edge("advise_node", END)

    return graph.compile()
