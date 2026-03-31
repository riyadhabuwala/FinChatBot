from app.rag.query_rewriter import rewrite_for_mode
from app.rag.hybrid_search import hybrid_search
from app.rag.reranker import mmr_rerank, filter_by_threshold
from app.rag.embedder import embed_query
from app.config import settings


def _dedupe_candidates(candidates: list[dict]) -> list[dict]:
    deduped = {}
    for item in candidates:
        chunk = item.get("chunk")
        if not chunk:
            continue
        chunk_id = chunk.get("chunk_id")
        if not chunk_id:
            continue
        score = item.get("combined_score", item.get("score", 0))
        existing = deduped.get(chunk_id)
        if existing is None or score > existing.get("combined_score", 0):
            deduped[chunk_id] = {
                "chunk": chunk,
                "combined_score": score,
                "in_faiss": item.get("in_faiss", False),
                "in_bm25": item.get("in_bm25", False),
            }
    return list(deduped.values())


def retrieve(
    user_id: str,
    query: str,
    file_ids: list[str],
    mode: str,
    top_k: int | None = None,
) -> dict:
    rewritten = rewrite_for_mode(query, mode)
    primary_query = rewritten["primary_query"]
    expansion_queries = rewritten["expansion_queries"]

    all_candidates = []
    for q in [primary_query] + expansion_queries:
        results = hybrid_search(user_id, q, file_ids, top_k=settings.top_k_retrieval)
        all_candidates.extend(results)

    candidates = _dedupe_candidates(all_candidates)

    filtered = filter_by_threshold(candidates, settings.similarity_threshold)
    if not filtered:
        filtered = filter_by_threshold(candidates, 0.1)

    if not filtered:
        return {
            "context": "",
            "sources": [],
            "chunk_count": 0,
            "query_used": primary_query,
            "fallback": True,
            "reason": "no_relevant_chunks",
        }

    query_embedding = embed_query(primary_query)
    final_candidates = mmr_rerank(query_embedding, filtered, top_k=settings.top_k_reranked)

    context_parts = []
    sources = []
    for item in final_candidates:
        chunk = item["chunk"]
        meta = chunk.get("metadata", {})
        source_file = meta.get("source_file", "unknown")
        page_num = meta.get("page_num", "?")
        context_parts.append(f"--- Source: {source_file}, Page {page_num} ---\n{chunk['text']}\n")
        sources.append(
            {
                "file": source_file,
                "page": page_num,
                "chunk_id": chunk.get("chunk_id"),
            }
        )

    return {
        "context": "\n".join(context_parts),
        "sources": sources,
        "chunk_count": len(final_candidates),
        "query_used": primary_query,
        "fallback": False,
    }
