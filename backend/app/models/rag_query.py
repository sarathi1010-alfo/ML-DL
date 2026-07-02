"""RAG query ORM model."""
from __future__ import annotations
from datetime import datetime
from sqlalchemy import Integer, String, DateTime, Text, Float
from sqlalchemy.orm import Mapped, mapped_column
from ..database import Base


class RagQuery(Base):
    __tablename__ = "rag_queries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    query: Mapped[str] = mapped_column(Text, nullable=False)
    answer: Mapped[str] = mapped_column(Text, default="", nullable=False)
    chunks_used: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    retrieval_confidence: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    latency_ms: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True, nullable=False)
