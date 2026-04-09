from langgraph.graph import StateGraph, END
from app.agent.state import AgentState
from app.agent.nodes.planner import planner_node
from app.agent.nodes.analyst import analyst_node
from app.agent.nodes.writer import writer_node
from app.agent.nodes.critic import critic_node


def should_retry(state: AgentState) -> str:
    if state.get("approved"):
        return "end"
    if state.get("retry_count", 0) < 1:
        return "retry_writer"
    return "end"


def build_agent_graph():
    graph = StateGraph(AgentState)

    graph.add_node("planner", planner_node)
    graph.add_node("analyst", analyst_node)
    graph.add_node("writer", writer_node)
    graph.add_node("critic", critic_node)

    graph.add_edge("planner", "analyst")
    graph.add_edge("analyst", "writer")
    graph.add_edge("writer", "critic")

    graph.add_conditional_edges(
        "critic",
        should_retry,
        {
            "end": END,
            "retry_writer": "writer",
        },
    )

    graph.set_entry_point("planner")

    return graph.compile(checkpointer=None)


agent_graph = build_agent_graph()
