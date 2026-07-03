"""GenAI router — POST /genai/case-study, /genai/quiz, /genai/simulation."""
from __future__ import annotations
import json
import time
from datetime import datetime
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from ..deps import get_db, get_optional_user
from ..models.user import User
from ..models.learning_session import LearningSession
from ..schemas.genai import (
    CaseStudyRequest, CaseStudyResponse,
    QuizRequest, QuizResponse,
    SimulationRequest, SimulationResponse,
)
from ..services.model_registry import registry
from ..services.metrics_service import metrics_service

router = APIRouter(prefix="/genai", tags=["genai"])


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


@router.post("/case-study", response_model=CaseStudyResponse)
def case_study(
    req: CaseStudyRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_optional_user),
):
    payload = req.model_dump()
    t0 = time.perf_counter()
    result = registry.genai.generate_case_study(payload)
    metrics_service.record_model("GenAI LLM", (time.perf_counter() - t0) * 1000)
    _persist(db, user, "case_study", payload, result)
    # Map to schema field name; safety field is passed through automatically via **result
    return CaseStudyResponse(
        case_study=result["case_study"],
        questions=result["questions"],
        learning_objectives=result["learning_objectives"],
        model=result["model"],
        latency_ms=result["latency_ms"],
        safety=result.get("safety"),
    )


@router.post("/quiz", response_model=QuizResponse)
def quiz(
    req: QuizRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_optional_user),
):
    payload = req.model_dump()
    t0 = time.perf_counter()
    result = registry.genai.generate_quiz(payload)
    metrics_service.record_model("GenAI LLM", (time.perf_counter() - t0) * 1000)
    _persist(db, user, "quiz", payload, result)
    return QuizResponse(**result)


@router.post("/simulation", response_model=SimulationResponse)
def simulation(
    req: SimulationRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_optional_user),
):
    payload = req.model_dump()
    t0 = time.perf_counter()
    result = registry.genai.generate_simulation(payload)
    metrics_service.record_model("GenAI LLM", (time.perf_counter() - t0) * 1000)
    _persist(db, user, "simulation", payload, result)
    return SimulationResponse(**result)
