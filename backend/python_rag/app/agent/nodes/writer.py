from langchain_groq import ChatGroq
from app.agent.state import AgentState
from app.agent.prompts import WRITER_PROMPT
from app.config import settings

llm = ChatGroq(
    groq_api_key=settings.groq_api_key,
    model_name="llama-3.3-70b-versatile",
    temperature=0.4,
    max_tokens=2048,
)


async def writer_node(state: AgentState) -> dict:
    await state["stream_callback"]("agent_step", {
        "agent": "Writer",
        "status": "running",
        "step": 3,
    })

    results_text = "\n\n".join([
        f"Task {i + 1}: {r['description']}\nResult: {r['result']}"
        for i, r in enumerate(state["analysis_results"])
    ])

    critique_section = ""
    if state.get("critique"):
        critique_section = f"\n\nPREVIOUS CRITIQUE (fix these issues):\n{state['critique']}\n"

    prompt = WRITER_PROMPT.format(
        goal=state["goal"],
        analysis_results=results_text,
        critique_section=critique_section,
    )

    draft = ""
    async for chunk in llm.astream([{"role": "user", "content": prompt}]):
        text = chunk.content
        if text:
            draft += text
            await state["stream_callback"]("report_chunk", {"text": text})

    await state["stream_callback"]("agent_step", {
        "agent": "Writer",
        "status": "done",
        "step": 3,
        "output": "Report drafted",
    })

    return {"draft_report": draft}
