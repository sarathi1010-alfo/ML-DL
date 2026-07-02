"""RAG service — TF-IDF + TruncatedSVD embeddings + FAISS IndexFlatIP.

No sentence-transformers. Chunks text by sentences (~3 per chunk, overlap 1),
embeds via TfidfVectorizer(max_features=5000, ngram_range=(1,2)) + TruncatedSVD(64),
L2-normalizes, stores in a FAISS IndexFlatIP (inner product = cosine after norm).
Default knowledge base is seeded on first init so /rag/query works immediately.
"""
from __future__ import annotations
import io
import re
import time
import hashlib
import asyncio
from typing import Any
import numpy as np

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.decomposition import TruncatedSVD
from sklearn.preprocessing import normalize

import faiss

from ..core.logging import logger
from .model_registry import save_artifact, load_artifact
from .llm_client import llm_client


DEFAULT_KB = [
    # Property / HR policy sentences (from the notebook)
    ("property_policy.txt", "Standard termination requires 30-day written notice from either the employer or the employee."),
    ("property_policy.txt", "Annual property insurance premium is calculated based on the property's location, age, and construction type."),
    ("property_policy.txt", "Claims must be filed within 60 days of the incident with supporting documentation and photos."),
    ("property_policy.txt", "Liability coverage includes bodily injury and property damage up to the policy limit."),
    # HR onboarding policies
    ("hr_policy.txt", "New employees must complete onboarding within the first 5 business days, including IT setup and policy acknowledgment."),
    ("hr_policy.txt", "Standard onboarding requires provisioning of SSO, Git, Jira, and corporate email accounts."),
    ("hr_policy.txt", "Welcome emails are sent automatically once access provisioning is complete."),
    ("hr_policy.txt", "Employees receive 20 days of paid time off per year, accruing monthly."),
    ("hr_policy.txt", "Probation period is 90 days, during which either party may terminate employment with 14-day notice."),
    ("hr_policy.txt", "Remote work is permitted up to 3 days per week with manager approval."),
    ("hr_policy.txt", "Performance reviews are conducted biannually in June and December."),
    ("hr_policy.txt", "All employees must complete mandatory security awareness training annually."),
]


def chunk_text(text: str, sentences_per_chunk: int = 3, overlap: int = 1) -> list[str]:
    """Split text into ~N-sentence chunks with overlap."""
    # Sentence splitter: split on ., !, ? followed by whitespace
    sents = re.split(r"(?<=[.!?])\s+", text.strip())
    sents = [s.strip() for s in sents if s.strip()]
    if not sents:
        return []
    chunks = []
    step = max(1, sentences_per_chunk - overlap)
    i = 0
    while i < len(sents):
        chunk = " ".join(sents[i:i + sentences_per_chunk])
        if chunk:
            chunks.append(chunk)
        i += step
    return chunks


class RagService:
    EMBED_DIM = 64

    def __init__(self) -> None:
        self.tfidf: TfidfVectorizer | None = None
        self.svd: TruncatedSVD | None = None
        self.index: faiss.IndexFlatIP | None = None
        self.chunks: list[dict] = []  # {document, chunk_index, text}
        self._fitted = False

    def _ensure_fitted(self) -> None:
        if self._fitted and self.tfidf is not None and self.svd is not None and self.index is not None:
            return
        # Fit on current chunks (or default if empty)
        if not self.chunks:
            self.seed_default_knowledge_base()
        texts = [c["text"] for c in self.chunks]
        self.tfidf = TfidfVectorizer(max_features=5000, ngram_range=(1, 2), stop_words="english")
        tfidf_mat = self.tfidf.fit_transform(texts)
        n_comp = min(self.EMBED_DIM, max(2, tfidf_mat.shape[0] - 1, tfidf_mat.shape[1] - 1))
        self.svd = TruncatedSVD(n_components=n_comp, random_state=42)
        dense = self.svd.fit_transform(tfidf_mat)
        dense = normalize(dense).astype(np.float32)
        self.dim = dense.shape[1]
        self.index = faiss.IndexFlatIP(self.dim)
        self.index.add(dense)
        self._fitted = True
        logger.info(f"RAG index built: {len(self.chunks)} chunks, dim={self.dim}")

    def _embed_query(self, query: str) -> np.ndarray:
        tf = self.tfidf.transform([query])
        v = self.svd.transform(tf)
        v = normalize(v).astype(np.float32)
        return v[0]

    def _rebuild_index(self) -> None:
        """Re-fit on the current chunk corpus."""
        if not self.chunks:
            self.index = faiss.IndexFlatIP(self.EMBED_DIM) if hasattr(self, "dim") else None
            self._fitted = False
            return
        texts = [c["text"] for c in self.chunks]
        self.tfidf = TfidfVectorizer(max_features=5000, ngram_range=(1, 2), stop_words="english")
        tfidf_mat = self.tfidf.fit_transform(texts)
        n_comp = min(self.EMBED_DIM, max(2, tfidf_mat.shape[0] - 1, tfidf_mat.shape[1] - 1))
        self.svd = TruncatedSVD(n_components=n_comp, random_state=42)
        dense = self.svd.fit_transform(tfidf_mat)
        dense = normalize(dense).astype(np.float32)
        self.dim = dense.shape[1]
        self.index = faiss.IndexFlatIP(self.dim)
        self.index.add(dense)
        self._fitted = True

    def seed_default_knowledge_base(self) -> None:
        """Add the default KB if not already present."""
        if self.chunks:
            return
        for filename, text in DEFAULT_KB:
            chunks = chunk_text(text, sentences_per_chunk=3, overlap=1)
            if not chunks:
                chunks = [text]
            for i, c in enumerate(chunks):
                self.chunks.append({
                    "document": filename,
                    "chunk_index": i,
                    "text": c,
                })
        self._rebuild_index()

    def add_document(self, filename: str, text: str) -> int:
        """Add a document, chunk it, rebuild index. Returns chunk count."""
        chunks = chunk_text(text, sentences_per_chunk=3, overlap=1)
        if not chunks:
            chunks = [text] if text.strip() else []
        added = 0
        # Reset chunk_index for that filename
        existing = [c for c in self.chunks if c["document"] != filename]
        for i, c in enumerate(chunks):
            existing.append({"document": filename, "chunk_index": i, "text": c})
            added += 1
        self.chunks = existing
        self._rebuild_index()
        return added

    def retrieve(self, query: str, top_k: int = 3) -> list[dict]:
        self._ensure_fitted()
        if self.index is None or len(self.chunks) == 0:
            return []
        qv = self._embed_query(query)
        k = min(top_k, len(self.chunks))
        scores, indices = self.index.search(qv.reshape(1, -1), k)
        out = []
        for sc, idx in zip(scores[0], indices[0]):
            if idx < 0:
                continue
            chunk = self.chunks[idx]
            out.append({
                "document": chunk["document"],
                "chunk_index": chunk["chunk_index"],
                "text": chunk["text"],
                "score": float(round(max(0.0, float(sc)), 4)),
            })
        return out

    async def query(self, query: str, top_k: int = 3) -> dict:
        t0 = time.perf_counter()
        sources = self.retrieve(query, top_k=top_k)
        retrieval_confidence = max([s["score"] for s in sources], default=0.0)
        # Answer synthesis via LLM with fallback
        context = "\n".join([f"[{i+1}] ({s['document']}) {s['text']}" for i, s in enumerate(sources)])
        prompt = (
            f"Below are the most relevant excerpts retrieved from the internal knowledge base.\n\n"
            f"Context:\n{context}\n\n"
            f"Question: {query}\n\n"
            f"Write a concise, helpful answer grounded in the context above. "
            f"If the context is relevant, use it directly. Do not claim the information is missing "
            f"when a relevant excerpt is present. Answer in 1-3 sentences."
        )
        answer = ""
        try:
            answer = await llm_client.chat(
                prompt,
                system=(
                    "You are a knowledgeable internal assistant. Answer the user's question using "
                    "the provided context excerpts. Be concise and helpful. Synthesize from the context; "
                    "only say information is unavailable if the context is truly unrelated."
                ),
                max_tokens=220,
            )
        except Exception:
            answer = ""
        if not answer or not answer.strip():
            # Fallback template
            if sources:
                answer = f"Based on the knowledge base: {sources[0]['text']}"
            else:
                answer = "I could not find relevant information in the knowledge base for that question."
        latency_ms = int((time.perf_counter() - t0) * 1000)
        return {
            "answer": answer.strip(),
            "sources": sources,
            "retrieval_confidence": round(retrieval_confidence, 4),
            "chunks_used": len(sources),
            "latency_ms": latency_ms,
        }

    def list_documents(self) -> list[dict]:
        """Aggregate chunks per document filename."""
        agg: dict[str, dict] = {}
        for c in self.chunks:
            d = c["document"]
            if d not in agg:
                agg[d] = {"id": d, "filename": d, "chunks": 0, "size_kb": 0.0, "uploaded_at": ""}
            agg[d]["chunks"] += 1
            agg[d]["size_kb"] += len(c["text"]) / 1024.0
        return list(agg.values())

    def delete_document(self, filename: str) -> bool:
        before = len(self.chunks)
        self.chunks = [c for c in self.chunks if c["document"] != filename]
        deleted = before - len(self.chunks)
        if deleted > 0:
            self._rebuild_index()
        return deleted > 0


def extract_text_from_pdf(file_bytes: bytes) -> str:
    """Try pypdf, fall back to PyPDF2, finally to decoding as text."""
    try:
        from pypdf import PdfReader
        reader = PdfReader(io.BytesIO(file_bytes))
        parts = []
        for page in reader.pages:
            try:
                parts.append(page.extract_text() or "")
            except Exception:
                continue
        text = "\n".join(parts).strip()
        if text:
            return text
    except Exception as e:
        logger.debug(f"pypdf extract failed: {e}")
    try:
        import PyPDF2
        reader = PyPDF2.PdfReader(io.BytesIO(file_bytes))
        parts = []
        for page in reader.pages:
            try:
                parts.append(page.extract_text() or "")
            except Exception:
                continue
        text = "\n".join(parts).strip()
        if text:
            return text
    except Exception as e:
        logger.debug(f"PyPDF2 extract failed: {e}")
    # Last resort
    try:
        return file_bytes.decode("utf-8", errors="ignore")
    except Exception:
        return ""


def extract_text_from_txt(file_bytes: bytes) -> str:
    try:
        return file_bytes.decode("utf-8", errors="ignore")
    except Exception:
        return ""


def content_hash(file_bytes: bytes) -> str:
    return hashlib.sha256(file_bytes).hexdigest()[:16]
