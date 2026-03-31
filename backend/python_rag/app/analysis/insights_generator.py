from app.analysis.stats import compute_financial_stats
from app.rag.retriever import retrieve


def generate_insights(user_id: str, file_ids: list[str], file_paths: list[str]) -> dict:
    stats = compute_financial_stats(file_paths)
    context_result = retrieve(
        user_id,
        "financial performance summary trends key metrics",
        file_ids,
        mode="insights",
    )
    return {
        "stats": stats,
        "context": context_result.get("context", ""),
        "sources": context_result.get("sources", []),
    }
