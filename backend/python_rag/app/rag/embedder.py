from sentence_transformers import SentenceTransformer
from app.config import settings

_model = None


def init_embedder():
    global _model
    _model = SentenceTransformer(settings.embedding_model)


def get_embedder() -> SentenceTransformer:
    global _model
    if _model is None:
        init_embedder()
    return _model


def embed_texts(texts: list[str]) -> list[list[float]]:
    model = get_embedder()
    embeddings = model.encode(texts, normalize_embeddings=True, show_progress_bar=False)
    return embeddings.tolist()


def embed_query(query: str) -> list[float]:
    return embed_texts([query])[0]
