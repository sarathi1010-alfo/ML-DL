"""SLM router — POST /slm/scenario, /slm/explain, /slm/converse."""
from __future__ import annotations
import json
import time
from datetime import datetime
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from ..deps import get_db, get_optional_user
from ..models.user import User
from ..models.learning_session import LearningSession
from ..schemas.slm import (
    ScenarioRequest, ScenarioResponse,
    ExplainRequest, ExplainResponse,
    ConverseRequest, ConverseResponse,
)
from ..services.model_registry import registry
from ..services.metrics_service import metrics_service

router = APIRouter(prefix="/slm", tags=["slm"])


def _persist(db: Session, user: User | None, type_: str, payload: dict, result: dict) -> None:
    try:
        session = LearningSession(
            user_id=user.id if user else None,
            type=type_,
            input=json.dumps(payload, default=str),
            output=json.dumps(result, default=str),
            latency_ms=int(result.get("latency_ms", 0)),
            created_at=datetime.utcnow(),
        )
        db.add(session)
        db.commit()
    except Exception:
        db.rollback()


@router.post("/scenario", response_model=ScenarioResponse)
def scenario(
    req: ScenarioRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_optional_user),
):
    payload = req.model_dump()
    t0 = time.perf_counter()
    result = registry.slm.generate_scenario(payload)
    metrics_service.record_model("SLM TinyLlama-Q4", (time.perf_counter() - t0) * 1000)
    _persist(db, user, "scenario", payload, result)
    return ScenarioResponse(**result)


@router.post("/explain", response_model=ExplainResponse)
def explain(
    req: ExplainRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_optional_user),
):
    payload = req.model_dump()
    t0 = time.perf_counter()
    result = registry.slm.explain(payload)
    metrics_service.record_model("SLM TinyLlama-Q4", (time.perf_counter() - t0) * 1000)
    _persist(db, user, "explain", payload, result)
    return ExplainResponse(**result)


@router.post("/converse", response_model=ConverseResponse)
def converse(
    req: ConverseRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_optional_user),
):
    payload = req.model_dump()
    t0 = time.perf_counter()
    result = registry.slm.converse(payload)
    metrics_service.record_model("SLM TinyLlama-Q4", (time.perf_counter() - t0) * 1000)
    _persist(db, user, "converse", payload, result)
    return ConverseResponse(**result)
