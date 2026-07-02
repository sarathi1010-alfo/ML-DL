"""RAG router."""
from __future__ import annotations
from datetime import datetime
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, Query
from sqlalchemy.orm import Session
from ..deps import get_db, get_optional_user
from ..models.user import User
from ..models.document import UploadedDocument
from ..models.rag_query import RagQuery
from ..schemas.rag import RagQueryRequest, RagQueryResponse, RagDocumentsResponse, RagUploadResponse, RagDocumentOut
from ..services.model_registry import registry
from ..services.rag_service import extract_text_from_pdf, extract_text_from_txt, content_hash
from ..services.metrics_service import metrics_service
from ..core.logging import logger

router = APIRouter(prefix="/rag", tags=["rag"])


def _doc_id(d: dict) -> str:
    return f"doc_{abs(hash(d.get('filename', ''))) % (10 ** 8)}"


@router.post("/upload", response_model=RagUploadResponse)
async def upload_document(file: UploadFile = File(...), user: User = Depends(get_optional_user), db: Session = Depends(get_db)):
    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=422, detail="Empty file upload")
    filename = file.filename or "document.txt"
    ext = filename.lower().rsplit(".", 1)[-1] if "." in filename else "txt"
    if ext == "pdf":
        text = extract_text_from_pdf(file_bytes)
    else:
        text = extract_text_from_txt(file_bytes)
    if not text.strip():
        raise HTTPException(status_code=422, detail="Could not extract any text from the document")
    rag = registry.rag
    chunks = rag.add_document(filename, text)
    chash = content_hash(file_bytes)
    size_kb = round(len(file_bytes) / 1024.0, 2)
    # Persist document row
    try:
        doc = UploadedDocument(filename=filename, chunks=chunks, size_kb=size_kb, content_hash=chash, created_at=datetime.utcnow())
        db.add(doc)
        db.commit()
        db.refresh(doc)
        doc_pk = doc.id
    except Exception:
        db.rollback()
        doc_pk = abs(hash(filename)) % (10 ** 8)
    return RagUploadResponse(
        document_id=f"doc_{doc_pk}",
        filename=filename,
        chunks=chunks,
        message="Indexed successfully",
        status="ok",
    )


@router.post("/query", response_model=RagQueryResponse)
async def query_rag(req: RagQueryRequest, user: User = Depends(get_optional_user), db: Session = Depends(get_db)):
    rag = registry.rag
    result = await rag.query(req.query, top_k=req.top_k)
    metrics_service.record_model("RAG FAISS", result["latency_ms"])
    try:
        db.add(RagQuery(
            query=req.query, answer=result["answer"],
            chunks_used=result["chunks_used"], retrieval_confidence=result["retrieval_confidence"],
            latency_ms=result["latency_ms"], created_at=datetime.utcnow(),
        ))
        db.commit()
    except Exception:
        db.rollback()
    return result


@router.get("/documents", response_model=RagDocumentsResponse)
def list_documents(db: Session = Depends(get_db)):
    # Combine in-memory RAG docs with DB-persisted docs
    rag = registry.rag
    docs = rag.list_documents()
    out = []
    seen = set()
    for d in docs:
        out.append(RagDocumentOut(
            id=0,
            filename=d["filename"],
            chunks=d["chunks"],
            size_kb=round(d["size_kb"], 2),
            uploaded_at="",
        ))
        seen.add(d["filename"])
    # Add any DB docs not in memory
    try:
        rows = db.query(UploadedDocument).order_by(UploadedDocument.id.desc()).all()
        for r in rows:
            if r.filename in seen:
                continue
            out.append(RagDocumentOut(
                id=r.id,
                filename=r.filename,
                chunks=r.chunks,
                size_kb=round(r.size_kb, 2),
                uploaded_at=r.created_at.isoformat() if r.created_at else "",
            ))
    except Exception:
        pass
    return RagDocumentsResponse(documents=out)


@router.delete("/documents/{document_id}")
def delete_document(document_id: str, db: Session = Depends(get_db)):
    # document_id can be a filename or "doc_<pk>"
    rag = registry.rag
    target_filename = None
    # Try direct filename match
    for d in rag.list_documents():
        if d["filename"] == document_id or f"doc_{abs(hash(d['filename'])) % (10**8)}" == document_id:
            target_filename = d["filename"]
            break
    if target_filename is None:
        # Fallback: maybe it's the filename itself
        target_filename = document_id
    deleted = rag.delete_document(target_filename)
    try:
        row = db.query(UploadedDocument).filter(UploadedDocument.filename == target_filename).first()
        if row:
            db.delete(row)
            db.commit()
    except Exception:
        db.rollback()
    return {"status": "deleted" if deleted else "not_found", "document_id": document_id}
