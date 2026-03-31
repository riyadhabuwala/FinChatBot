from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    groq_api_key: str
    embedding_model: str = "all-MiniLM-L6-v2"
    chunk_size: int = 512
    chunk_overlap: int = 64
    top_k_retrieval: int = 20
    top_k_reranked: int = 6
    similarity_threshold: float = 0.25
    index_dir: str = "./indexes"
    upload_dir: str = "../uploads"
    port: int = 8000

    class Config:
        env_file = ".env"


settings = Settings()
