"""RAG schemas."""
from __future__ import annotations
from pydantic import BaseModel, Field


class RagQueryRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=2000)
    top_k: int = Field(3, ge=1, le=20)


class RagSource(BaseModel):
    document: str
    chunk_index: int
    text: str
    score: float


class RagQueryResponse(BaseModel):
    answer: str
    sources: list[RagSource]
    retrieval_confidence: float
    chunks_used: int
    latency_ms: int


class RagDocumentOut(BaseModel):
    id: int
    filename: str
    chunks: int
    size_kb: float
    uploaded_at: str


class RagDocumentsResponse(BaseModel):
    documents: list[RagDocumentOut]


class RagUploadResponse(BaseModel):
    document_id: str
    filename: str
    chunks: int
    message: str
    status: str
