"""Learning-session history + users router."""
from __future__ import annotations
import json
from datetime import datetime
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import select, func
from ..deps import get_db, get_optional_user, get_current_user
from ..models.user import User
from ..models.learning_session import LearningSession
from ..schemas.metrics import PredictionOut, PredictionsResponse, UserStats

router = APIRouter(prefix="", tags=["predictions", "users"])


@router.get("/predictions", response_model=PredictionsResponse)
def list_predictions(
    type: str | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=200),
    db: Session = Depends(get_db),
):
    q = db.query(LearningSession)
    if type:
        q = q.filter(LearningSession.type == type)
    rows = q.order_by(LearningSession.id.desc()).limit(limit).all()
    out = []
    for r in rows:
        try:
            inp = json.loads(r.input) if r.input else {}
        except Exception:
            inp = r.input
        try:
            outp = json.loads(r.output) if r.output else {}
        except Exception:
            outp = r.output
        out.append(PredictionOut(
            id=r.id, type=r.type, input=inp, output=outp,
            created_at=r.created_at.isoformat() if r.created_at else "",
            latency_ms=r.latency_ms,
        ))
    return PredictionsResponse(predictions=out)


@router.get("/users/me")
def users_me(user: User = Depends(get_current_user)):
    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "role": user.role,
        "specialty": getattr(user, "specialty", "general"),
    }


@router.get("/users/stats", response_model=UserStats)
def users_stats(user: User = Depends(get_optional_user), db: Session = Depends(get_db)):
    total = db.query(func.count(LearningSession.id)).filter(LearningSession.user_id == user.id).scalar() or 0
    rows = db.query(LearningSession.type, func.count(LearningSession.id)).filter(
        LearningSession.user_id == user.id
    ).group_by(LearningSession.type).all()
    by_type = {t: c for t, c in rows}
    last = db.query(func.max(LearningSession.created_at)).filter(LearningSession.user_id == user.id).scalar()
    return UserStats(
        total_predictions=int(total),
        by_type=by_type,
        last_active=last.isoformat() if last else None,
    )
