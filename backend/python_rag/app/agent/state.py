from typing import TypedDict, Optional


class Task(TypedDict):
    id: str
    description: str
    requires_data: bool
    result: Optional[str]
    code_used: Optional[str]
    chart_data: Optional[dict]


class AgentState(TypedDict):
    goal: str
    file_ids: list[str]
    user_id: str
    file_paths: list[str]

    tasks: list[Task]
    analysis_results: list[dict]
    raw_data_summary: str

    draft_report: str
    chart_specs: list[dict]

    approved: bool
    critique: str
    confidence: float
    retry_count: int

    final_report: str
    final_charts: list[dict]

    stream_callback: object
