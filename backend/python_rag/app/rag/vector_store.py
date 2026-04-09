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


def _rebuild_index(embeddings_list: list[list[float]], chunks: list[dict], dim: int = 384):
    """Rebuild a FAISS index from scratch given embeddings and chunks."""
    if not embeddings_list:
        index = faiss.IndexFlatIP(dim)
        return index, []
    vectors = np.array(embeddings_list, dtype=np.float32)
    dim = vectors.shape[1]
    index = faiss.IndexFlatIP(dim)
    index.add(vectors)
    return index, chunks


def add_to_index(user_id: str, embeddings: list[list[float]], chunks: list[dict]):
    """Add chunks to the index, replacing any existing chunks with the same file_id."""
    if not embeddings or not chunks:
        return

    # Determine the file_id(s) being added
    new_file_ids = set()
    for c in chunks:
        fid = c.get("metadata", {}).get("file_id")
        if fid:
            new_file_ids.add(fid)

    index, metadata = load_index(user_id)
    if index is None:
        dim = len(embeddings[0]) if embeddings else 384
        index = faiss.IndexFlatIP(dim)
        metadata = []

    # If there are existing chunks for the same file_id(s), rebuild without them
    if metadata and new_file_ids:
        old_count = len(metadata)
        keep_indices = [
            i for i, m in enumerate(metadata)
            if m.get("metadata", {}).get("file_id") not in new_file_ids
        ]
        removed = old_count - len(keep_indices)
        if removed > 0:
            # Rebuild index without the old file's chunks
            from app.rag.embedder import embed_texts
            kept_chunks = [metadata[i] for i in keep_indices]
            if kept_chunks:
                kept_embeddings = embed_texts([c["text"] for c in kept_chunks])
                index, metadata = _rebuild_index(kept_embeddings, kept_chunks)
            else:
                dim = len(embeddings[0])
                index = faiss.IndexFlatIP(dim)
                metadata = []
            print(f"[vector_store] Removed {removed} old chunks for file_ids={new_file_ids}")

    vectors = np.array(embeddings, dtype=np.float32)
    index.add(vectors)
    metadata.extend(chunks)
    save_index(user_id, index, metadata)


def remove_file_from_index(user_id: str, file_id: str) -> int:
    """Remove all chunks belonging to a specific file_id. Returns count of removed chunks."""
    index, metadata = load_index(user_id)
    if index is None or not metadata:
        return 0

    keep_indices = [
        i for i, m in enumerate(metadata)
        if m.get("metadata", {}).get("file_id") != file_id
    ]
    removed = len(metadata) - len(keep_indices)
    if removed == 0:
        return 0

    kept_chunks = [metadata[i] for i in keep_indices]
    if kept_chunks:
        from app.rag.embedder import embed_texts
        kept_embeddings = embed_texts([c["text"] for c in kept_chunks])
        index, metadata = _rebuild_index(kept_embeddings, kept_chunks)
    else:
        dim = index.d if index.ntotal > 0 else 384
        index = faiss.IndexFlatIP(dim)
        metadata = []

    save_index(user_id, index, metadata)
    return removed


def search_index(user_id: str, query_embedding: list[float], file_ids: list[str], top_k: int) -> list[dict]:
    index, metadata = load_index(user_id)
    if index is None or not metadata:
        return []

    query_vec = np.array([query_embedding], dtype=np.float32)
    overfetch = min(len(metadata), top_k * 3)
    if overfetch == 0:
        return []
    scores, indices = index.search(query_vec, overfetch)
    results = []
    for rank, idx in enumerate(indices[0]):
        if idx < 0 or idx >= len(metadata):
            continue
        chunk = metadata[idx]
        meta = chunk.get("metadata", {})
        # Always filter by file_ids — never return unscoped results
        if not file_ids or meta.get("file_id") not in file_ids:
            continue
        results.append({"chunk": chunk, "score": float(scores[0][rank]), "rank": rank + 1})
        if len(results) >= top_k:
            break
    return results
