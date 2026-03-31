from fastapi import APIRouter
from pydantic import BaseModel
from app.rag.retriever import retrieve

router = APIRouter()


class RetrieveRequest(BaseModel):
    query: str
    file_ids: list[str]
    user_id: str
    mode: str = "smart_chat"


@router.post("")
async def retrieve_context(req: RetrieveRequest):
    if not req.file_ids:
        return {"context": "", "sources": [], "chunk_count": 0, "fallback": True, "reason": "no_files"}

    result = retrieve(
        user_id=req.user_id,
        query=req.query,
        file_ids=req.file_ids,
        mode=req.mode,
    )
    return result
