"""RAG router — POST /rag/query, POST /rag/upload, GET /rag/documents, DELETE /rag/documents/{id}."""
from __future__ import annotations
import time
from fastapi import APIRouter, File, UploadFile, HTTPException

from ..schemas.rag import (
    RagQueryRequest, RagQueryResponse, RagSource,
    RagUploadResponse, RagDocumentOut, RagDocumentsResponse, RagDeleteResponse,
)
from ..services.rag_service import rag_service
from ..services.metrics_service import metrics_service
from ..core.logging import logger

router = APIRouter(prefix="/rag", tags=["rag"])


@router.post("/query", response_model=RagQueryResponse)
async def rag_query(req: RagQueryRequest):
    """Answer a medical-communication question using retrieval-augmented generation."""
    t0 = time.perf_counter()
    result = await rag_service.query(req.query, top_k=req.top_k)
    metrics_service.record_model("RAG FAISS", (time.perf_counter() - t0) * 1000)
    return RagQueryResponse(
        answer=result["answer"],
        sources=[RagSource(**s) for s in result["sources"]],
        retrieval_confidence=result["retrieval_confidence"],
        chunks_used=result["chunks_used"],
        latency_ms=result["latency_ms"],
        model=result["model"],
        llm_used=result["llm_used"],
    )


@router.post("/upload", response_model=RagUploadResponse)
async def rag_upload(file: UploadFile = File(...)):
    """Upload a TXT or JSON document to add to the knowledge base.

    The file is split into ~3-sentence chunks with 1-sentence overlap, then
    added to the FAISS index.
    """
    filename = file.filename or "upload.txt"
    # Read & decode
    raw = await file.read()
    try:
        text = raw.decode("utf-8", errors="replace")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not decode file: {e}")
    if not text.strip():
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")
    if len(text) > 500_000:
        raise HTTPException(
            status_code=413,
            detail="File too large (max 500 KB). Please split into smaller documents.",
        )
    t0 = time.perf_counter()
    n_chunks = rag_service.add_document(filename, text)
    metrics_service.record_model("RAG FAISS", (time.perf_counter() - t0) * 1000)
    if n_chunks == 0:
        raise HTTPException(
            status_code=422,
            detail="No text chunks could be extracted from the uploaded file.",
        )
    # Locate the new document id (most recently added user document)
    docs = rag_service.list_documents()
    doc_id = docs[0]["id"] if docs else "unknown"
    logger.info(f"RAG upload: {filename} -> {n_chunks} chunks (id={doc_id})")
    return RagUploadResponse(
        document_id=doc_id,
        filename=filename,
        chunks=n_chunks,
        message=f"Added {n_chunks} chunks from '{filename}' to the knowledge base.",
    )


@router.get("/documents", response_model=RagDocumentsResponse)
def rag_documents():
    """List all documents in the knowledge base."""
    docs = rag_service.list_documents()
    out = [RagDocumentOut(**d) for d in docs]
    total_chunks = sum(d.chunks for d in out)
    return RagDocumentsResponse(
        documents=out,
        total_documents=len(out),
        total_chunks=total_chunks,
    )


@router.delete("/documents/{document_id}", response_model=RagDeleteResponse)
def rag_delete(document_id: str):
    """Delete a document (and all its chunks) by id.

    The seed KB (`id=seed_kb`) cannot be deleted — returns 403.
    """
    if document_id == "seed_kb":
        raise HTTPException(
            status_code=403,
            detail="The seed knowledge base cannot be deleted.",
        )
    # Capture chunk count before delete for the response
    docs = rag_service.list_documents()
    target = next((d for d in docs if d["id"] == document_id), None)
    chunks_removed = target["chunks"] if target else 0
    ok = rag_service.delete_document(document_id)
    if not ok:
        raise HTTPException(status_code=404, detail=f"Document '{document_id}' not found.")
    return RagDeleteResponse(
        status="deleted",
        id=document_id,
        chunks_removed=chunks_removed,
    )
