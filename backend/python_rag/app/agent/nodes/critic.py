import json
from langchain_groq import ChatGroq
from app.agent.state import AgentState
from app.agent.prompts import CRITIC_PROMPT
from app.config import settings

llm = ChatGroq(
    groq_api_key=settings.groq_api_key,
    model_name="llama-3.1-8b-instant",
    temperature=0.1,
    max_tokens=512,
)


async def critic_node(state: AgentState) -> dict:
    await state["stream_callback"]("agent_step", {
        "agent": "Critic",
        "status": "running",
        "step": 4,
    })

    results_text = "\n\n".join([
        f"Task: {r['description']}\nResult: {r['result']}"
        for r in state["analysis_results"]
    ])

    prompt = CRITIC_PROMPT.format(
        goal=state["goal"],
        analysis_results=results_text,
        draft_report=state["draft_report"],
    )

    response = await llm.ainvoke([{"role": "user", "content": prompt}])
    content = response.content.strip()

    try:
        if "```" in content:
            content = content.split("```")[1]
            if content.startswith("json"):
                content = content[4:]
        verdict = json.loads(content)
    except Exception:
        verdict = {"approved": True, "confidence": 0.7, "issues": [], "critique": ""}

    approved = verdict.get("approved", True)
    confidence = verdict.get("confidence", 0.7)
    critique = verdict.get("critique", "")
    issues = verdict.get("issues", [])

    await state["stream_callback"]("agent_step", {
        "agent": "Critic",
        "status": "done",
        "step": 4,
        "output": f"{'Approved' if approved else 'Rejected'} with {int(confidence * 100)}% confidence",
        "issues": issues,
    })

    retry_count = state.get("retry_count", 0)
    if not approved:
        retry_count += 1

    return {
        "approved": approved,
        "confidence": confidence,
        "critique": critique,
        "retry_count": retry_count,
        "final_report": state["draft_report"] if approved else "",
        "final_charts": state.get("chart_specs", []),
    }
