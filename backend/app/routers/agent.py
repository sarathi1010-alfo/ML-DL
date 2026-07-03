"""Tutor agent router — POST /agent/tutor, GET /agent/logs."""
from __future__ import annotations
import time
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from ..deps import get_db, get_optional_user
from ..models.user import User
from ..schemas.agent import TutorRequest, TutorResponse, AgentLogsResponse
from ..services.model_registry import registry
from ..services.metrics_service import metrics_service

router = APIRouter(prefix="/agent", tags=["agent"])


@router.post("/tutor", response_model=TutorResponse)
def tutor(
    req: TutorRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_optional_user),
):
    payload = req.model_dump()
    t0 = time.perf_counter()
    result = registry.agent.run(payload, db=db)
    metrics_service.record_model("Agent ReAct", (time.perf_counter() - t0) * 1000)
    return TutorResponse(**result)


@router.get("/logs", response_model=AgentLogsResponse)
def agent_logs(
    limit: int = Query(default=20, ge=1, le=200),
    db: Session = Depends(get_db),
):
    return AgentLogsResponse(**registry.agent.list_logs(db, limit=limit))
