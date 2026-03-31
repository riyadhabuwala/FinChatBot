import numpy as np
from app.rag.embedder import embed_texts


def mmr_rerank(
    query_embedding: list[float],
    candidates: list[dict],
    top_k: int = 6,
    lambda_param: float = 0.7,
) -> list[dict]:
    if not candidates:
        return []

    texts = [c["chunk"]["text"] for c in candidates]
    embeddings = np.array(embed_texts(texts), dtype=np.float32)
    query_vec = np.array(query_embedding, dtype=np.float32)

    sim_to_query = embeddings @ query_vec
    selected = []
    selected_indices = []

    for _ in range(min(top_k, len(candidates))):
        best_idx = None
        best_score = None
        for idx in range(len(candidates)):
            if idx in selected_indices:
                continue
            if not selected_indices:
                mmr_score = sim_to_query[idx]
            else:
                selected_embeds = embeddings[selected_indices]
                max_sim_selected = np.max(selected_embeds @ embeddings[idx])
                mmr_score = lambda_param * sim_to_query[idx] - (1 - lambda_param) * max_sim_selected
            if best_score is None or mmr_score > best_score:
                best_score = mmr_score
                best_idx = idx
        if best_idx is None:
            break
        selected_indices.append(best_idx)
        selected.append(candidates[best_idx])

    return selected


def filter_by_threshold(candidates: list[dict], threshold: float) -> list[dict]:
    return [c for c in candidates if c.get("combined_score", 0) >= threshold]
