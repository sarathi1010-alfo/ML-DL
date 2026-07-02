"""Uploaded document ORM model (RAG)."""
from __future__ import annotations
from datetime import datetime
from sqlalchemy import Integer, String, DateTime
from sqlalchemy.orm import Mapped, mapped_column
from ..database import Base


class UploadedDocument(Base):
    __tablename__ = "uploaded_documents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    filename: Mapped[str] = mapped_column(String(256), nullable=False)
    chunks: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    size_kb: Mapped[float] = mapped_column(default=0.0, nullable=False)
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
