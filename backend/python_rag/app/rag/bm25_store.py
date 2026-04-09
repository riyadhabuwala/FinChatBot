import pickle
from pathlib import Path
from rank_bm25 import BM25Okapi
from app.config import settings
from app.utils.file_utils import ensure_dir
from app.utils.text_utils import tokenize


def _bm25_path(user_id: str) -> Path:
    base = ensure_dir(settings.index_dir)
    return base / f"{user_id}.bm25.pkl"


def build_bm25(chunks: list[dict]) -> BM25Okapi:
    corpus = [tokenize(c["text"]) for c in chunks]
    return BM25Okapi(corpus)


def add_to_bm25(user_id: str, new_chunks: list[dict]):
    """Add chunks to BM25, replacing any existing chunks with the same file_id."""
    path = _bm25_path(user_id)
    all_chunks = []
    if path.exists():
        with open(path, "rb") as f:
            data = pickle.load(f)
            all_chunks = data.get("chunks", [])

    # Determine file_id(s) being added and remove old chunks for those files
    new_file_ids = set()
    for c in new_chunks:
        fid = c.get("metadata", {}).get("file_id")
        if fid:
            new_file_ids.add(fid)

    if new_file_ids and all_chunks:
        old_count = len(all_chunks)
        all_chunks = [
            c for c in all_chunks
            if c.get("metadata", {}).get("file_id") not in new_file_ids
        ]
        removed = old_count - len(all_chunks)
        if removed > 0:
            print(f"[bm25_store] Removed {removed} old chunks for file_ids={new_file_ids}")

    all_chunks.extend(new_chunks)
    bm25 = build_bm25(all_chunks) if all_chunks else None
    with open(path, "wb") as f:
        pickle.dump({"chunks": all_chunks, "bm25": bm25}, f)


def remove_file_from_bm25(user_id: str, file_id: str) -> int:
    """Remove all chunks belonging to a specific file_id. Returns count of removed chunks."""
    path = _bm25_path(user_id)
    if not path.exists():
        return 0
    with open(path, "rb") as f:
        data = pickle.load(f)
    all_chunks = data.get("chunks", [])
    filtered = [c for c in all_chunks if c.get("metadata", {}).get("file_id") != file_id]
    removed = len(all_chunks) - len(filtered)
    if removed == 0:
        return 0
    bm25 = build_bm25(filtered) if filtered else None
    with open(path, "wb") as f:
        pickle.dump({"chunks": filtered, "bm25": bm25}, f)
    return removed


def search_bm25(user_id: str, query: str, file_ids: list[str], top_k: int) -> list[dict]:
    path = _bm25_path(user_id)
    if not path.exists():
        return []
    with open(path, "rb") as f:
        data = pickle.load(f)
    chunks = data.get("chunks", [])
    bm25 = data.get("bm25")
    if not chunks or bm25 is None:
        return []

    scores = bm25.get_scores(tokenize(query))
    ranked = sorted(range(len(scores)), key=lambda i: scores[i], reverse=True)
    results = []
    for rank, idx in enumerate(ranked):
        chunk = chunks[idx]
        meta = chunk.get("metadata", {})
        # Always filter by file_ids — never return unscoped results
        if not file_ids or meta.get("file_id") not in file_ids:
            continue
        results.append({"chunk": chunk, "score": float(scores[idx]), "rank": rank + 1})
        if len(results) >= top_k:
            break
    return results
