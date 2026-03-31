from app.rag.vector_store import search_index
from app.rag.bm25_store import search_bm25
from app.rag.embedder import embed_query


def reciprocal_rank_fusion(
    faiss_results: list[dict],
    bm25_results: list[dict],
    k: int = 60,
    faiss_weight: float = 0.6,
    bm25_weight: float = 0.4,
) -> list[dict]:
    scores = {}

    def add_results(results, weight, label):
        for item in results:
            chunk = item["chunk"]
            chunk_id = chunk.get("chunk_id")
            if not chunk_id:
                continue
            rank = item.get("rank", 1)
            rrf_score = (weight / (k + rank)) * 100
            entry = scores.get(chunk_id)
            if entry is None:
                scores[chunk_id] = {
                    "chunk": chunk,
                    "combined_score": rrf_score,
                    "in_faiss": label == "faiss",
                    "in_bm25": label == "bm25",
                }
            else:
                entry["combined_score"] += rrf_score
                if label == "faiss":
                    entry["in_faiss"] = True
                if label == "bm25":
                    entry["in_bm25"] = True

    add_results(faiss_results, faiss_weight, "faiss")
    add_results(bm25_results, bm25_weight, "bm25")

    fused = list(scores.values())
    fused.sort(key=lambda x: x.get("combined_score", 0), reverse=True)
    return fused


def hybrid_search(
    user_id: str,
    query: str,
    file_ids: list[str],
    top_k: int = 20,
) -> list[dict]:
    query_embedding = embed_query(query)
    faiss_results = search_index(user_id, query_embedding, file_ids, top_k)
    bm25_results = search_bm25(user_id, query, file_ids, top_k)
    fused = reciprocal_rank_fusion(faiss_results, bm25_results)
    return fused[:top_k]
