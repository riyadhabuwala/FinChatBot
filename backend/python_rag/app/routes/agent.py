import asyncio
import json
import traceback
from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from app.agent.graph import agent_graph
from app.agent.state import AgentState

router = APIRouter()


class AgentRequest(BaseModel):
    goal: str
    file_ids: list[str]
    user_id: str = "demo"
    file_paths: list[str] = []


@router.post("/run")
async def run_agent(req: AgentRequest, request: Request):
    event_queue: asyncio.Queue = asyncio.Queue()

    async def stream_callback(event_name: str, data: dict):
        payload = f"event: {event_name}\ndata: {json.dumps(data)}\n\n"
        await event_queue.put(payload)

    async def run_graph():
        initial_state: AgentState = {
            "goal": req.goal,
            "file_ids": req.file_ids,
            "user_id": req.user_id,
            "file_paths": req.file_paths,
            "tasks": [],
            "analysis_results": [],
            "raw_data_summary": "",
            "draft_report": "",
            "chart_specs": [],
            "approved": False,
            "critique": "",
            "confidence": 0.0,
            "retry_count": 0,
            "final_report": "",
            "final_charts": [],
            "stream_callback": stream_callback,
        }

        try:
            final_state = await agent_graph.ainvoke(initial_state)
            await stream_callback("agent_done", {
                "report": final_state.get("final_report") or final_state.get("draft_report"),
                "chartData": final_state.get("final_charts", []),
                "confidence": final_state.get("confidence", 0.7),
                "approved": final_state.get("approved", True),
            })
        except Exception as exc:
            await stream_callback("agent_error", {
                "message": str(exc),
                "detail": traceback.format_exc(),
            })
        finally:
            await event_queue.put(None)

    async def event_generator():
        asyncio.create_task(run_graph())
        while True:
            item = await event_queue.get()
            if item is None:
                break
            if await request.is_disconnected():
                break
            yield item

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )
