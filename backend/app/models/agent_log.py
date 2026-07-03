"""Agent log ORM model (MediLingua tutor agent)."""
from __future__ import annotations
from datetime import datetime
from sqlalchemy import Integer, String, DateTime, Text
from sqlalchemy.orm import Mapped, mapped_column
from ..database import Base


class AgentLog(Base):
    __tablename__ = "agent_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    learner_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    task: Mapped[str] = mapped_column(String(256), nullable=False)
    current_level: Mapped[str] = mapped_column(String(8), nullable=True)
    target_level: Mapped[str] = mapped_column(String(8), nullable=True)
    specialty: Mapped[str] = mapped_column(String(64), nullable=True)
    steps_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="completed", nullable=False)
    total_latency_ms: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    steps: Mapped[str] = mapped_column(Text, default="[]", nullable=False)  # JSON
    final_answer: Mapped[str] = mapped_column(Text, default="", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True, nullable=False)
