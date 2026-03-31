from fastapi import APIRouter
from pydantic import BaseModel
from app.analysis.insights_generator import generate_insights

router = APIRouter()


class InsightsRequest(BaseModel):
    file_ids: list[str]
    user_id: str
    file_paths: list[str]


@router.post("")
async def run_insights(req: InsightsRequest):
    result = generate_insights(req.user_id, req.file_ids, req.file_paths)
    return result
