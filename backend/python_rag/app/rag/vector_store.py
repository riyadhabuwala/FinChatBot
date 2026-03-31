import os
import pickle
from pathlib import Path
import faiss
import numpy as np
from app.config import settings
from app.utils.file_utils import ensure_dir


def _index_paths(user_id: str) -> tuple[Path, Path]:
    base = ensure_dir(settings.index_dir)
    faiss_path = base / f"{user_id}.faiss"
    meta_path = base / f"{user_id}.meta.pkl"
    return faiss_path, meta_path


def load_index(user_id: str):
    faiss_path, meta_path = _index_paths(user_id)
    if not faiss_path.exists() or not meta_path.exists():
        return None, None
    index = faiss.read_index(str(faiss_path))
    with open(meta_path, "rb") as f:
        metadata = pickle.load(f)
    return index, metadata


def save_index(user_id: str, index, metadata: list[dict]):
    faiss_path, meta_path = _index_paths(user_id)
    faiss.write_index(index, str(faiss_path))
    with open(meta_path, "wb") as f:
        pickle.dump(metadata, f)


def add_to_index(user_id: str, embeddings: list[list[float]], chunks: list[dict]):
    index, metadata = load_index(user_id)
    if index is None:
        dim = len(embeddings[0]) if embeddings else 384
        index = faiss.IndexFlatIP(dim)
        metadata = []

    vectors = np.array(embeddings, dtype=np.float32)
    if len(vectors) > 0:
        index.add(vectors)
        metadata.extend(chunks)
        save_index(user_id, index, metadata)


def search_index(user_id: str, query_embedding: list[float], file_ids: list[str], top_k: int) -> list[dict]:
    index, metadata = load_index(user_id)
    if index is None or not metadata:
        return []

    query_vec = np.array([query_embedding], dtype=np.float32)
    overfetch = min(len(metadata), top_k * 3)
    scores, indices = index.search(query_vec, overfetch)
    results = []
    for rank, idx in enumerate(indices[0]):
        if idx < 0 or idx >= len(metadata):
            continue
        chunk = metadata[idx]
        meta = chunk.get("metadata", {})
        if file_ids and meta.get("file_id") not in file_ids:
            continue
        results.append({"chunk": chunk, "score": float(scores[0][rank]), "rank": rank + 1})
        if len(results) >= top_k:
            break
    return results
