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
    path = _bm25_path(user_id)
    all_chunks = []
    if path.exists():
        with open(path, "rb") as f:
            data = pickle.load(f)
            all_chunks = data.get("chunks", [])
    all_chunks.extend(new_chunks)
    bm25 = build_bm25(all_chunks) if all_chunks else None
    with open(path, "wb") as f:
        pickle.dump({"chunks": all_chunks, "bm25": bm25}, f)


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
        if file_ids and meta.get("file_id") not in file_ids:
            continue
        results.append({"chunk": chunk, "score": float(scores[idx]), "rank": rank + 1})
        if len(results) >= top_k:
            break
    return results
