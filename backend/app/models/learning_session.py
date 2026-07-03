"""Learning session ORM model (replaces Prediction)."""
from __future__ import annotations
from datetime import datetime
from sqlalchemy import Integer, String, DateTime, Text, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from ..database import Base


class LearningSession(Base):
    __tablename__ = "learning_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)
    type: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    # e.g. proficiency, acquisition, communication, scenario, explain, converse,
    # case_study, quiz, simulation
    input: Mapped[str] = mapped_column(Text, nullable=False)   # JSON
    output: Mapped[str] = mapped_column(Text, nullable=False)  # JSON
    latency_ms: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True, nullable=False)
