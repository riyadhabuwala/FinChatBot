from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.rag.ingestion import ingest_file
from app.rag.embedder import embed_texts
from app.rag.vector_store import add_to_index, remove_file_from_index
from app.rag.bm25_store import add_to_bm25, remove_file_from_bm25
import os

router = APIRouter()


class IngestRequest(BaseModel):
    file_path: str
    file_id: str
    filename: str
    user_id: str


class DeleteRequest(BaseModel):
    file_id: str
    user_id: str


@router.post("")
async def ingest_document(req: IngestRequest):
    if not os.path.exists(req.file_path):
        raise HTTPException(status_code=404, detail=f"File not found: {req.file_path}")

    result = ingest_file(req.file_path, req.file_id, req.filename)
    chunks = result["chunks"]

    if not chunks:
        raise HTTPException(status_code=422, detail="No content could be extracted from file")

    texts = [c["text"] for c in chunks]
    embeddings = embed_texts(texts)

    add_to_index(req.user_id, embeddings, chunks)
    add_to_bm25(req.user_id, chunks)

    return {
        "file_id": req.file_id,
        "filename": req.filename,
        "chunk_count": len(chunks),
        "status": "ingested",
    }


@router.post("/delete")
async def delete_document(req: DeleteRequest):
    """Remove a file's chunks from all indexes."""
    faiss_removed = remove_file_from_index(req.user_id, req.file_id)
    bm25_removed = remove_file_from_bm25(req.user_id, req.file_id)

    return {
        "file_id": req.file_id,
        "faiss_chunks_removed": faiss_removed,
        "bm25_chunks_removed": bm25_removed,
        "status": "deleted",
    }
