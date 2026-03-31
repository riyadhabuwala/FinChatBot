from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
from pathlib import Path
from app.routes import ingest, retrieve, insights
from app.config import settings
from app.rag.embedder import init_embedder

app = FastAPI(title="FinChatBot RAG Engine", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3001"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    Path(settings.index_dir).mkdir(parents=True, exist_ok=True)
    init_embedder()
    print("Embedding model loaded")


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "service": "python-rag",
        "embedding_model": settings.embedding_model,
        "index_dir": settings.index_dir,
    }


app.include_router(ingest.router, prefix="/ingest", tags=["ingest"])
app.include_router(retrieve.router, prefix="/retrieve", tags=["retrieve"])
app.include_router(insights.router, prefix="/insights", tags=["insights"])


if __name__ == "__main__":
    uvicorn.run("app.main:app", host="0.0.0.0", port=settings.port, reload=True)
