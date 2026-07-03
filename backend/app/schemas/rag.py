"""RAG schemas — for /api/v1/rag/* endpoints (medical knowledge base)."""
from __future__ import annotations
from pydantic import BaseModel, Field


# --------------------------------------------------------------------------- #
# POST /rag/query
# --------------------------------------------------------------------------- #
class RagQueryRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=2000)
    top_k: int = Field(default=3, ge=1, le=10)


class RagSource(BaseModel):
    """One retrieved knowledge chunk that grounded the generated answer."""
    chunk_id: int
    text: str
    score: float                       # cosine similarity (0..1, higher=more relevant)
    rank: int
    document_id: str
    document_filename: str
    category: str = "general"


class RagQueryResponse(BaseModel):
    answer: str
    sources: list[RagSource] = Field(default_factory=list)
    retrieval_confidence: float       # 0..1, mean of top-k scores
    chunks_used: int
    latency_ms: int
    model: str = "TF-IDF + SVD(64) + FAISS IndexFlatIP"
    llm_used: bool = True


# --------------------------------------------------------------------------- #
# POST /rag/upload (multipart)
# --------------------------------------------------------------------------- #
class RagUploadResponse(BaseModel):
    document_id: str
    filename: str
    chunks: int
    message: str


# --------------------------------------------------------------------------- #
# GET /rag/documents
# --------------------------------------------------------------------------- #
class RagDocumentOut(BaseModel):
    id: str
    filename: str
    chunks: int
    uploaded_at: str
    source: str = "user"              # "seed" (built-in KB) | "user" (uploaded)


class RagDocumentsResponse(BaseModel):
    documents: list[RagDocumentOut]
    total_documents: int
    total_chunks: int


# --------------------------------------------------------------------------- #
# DELETE /rag/documents/{id}
# --------------------------------------------------------------------------- #
class RagDeleteResponse(BaseModel):
    status: str = "deleted"
    id: str
    chunks_removed: int
