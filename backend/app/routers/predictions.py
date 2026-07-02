"""Predictions history + users router."""
from __future__ import annotations
import json
from datetime import datetime
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import select, func
from ..deps import get_db, get_optional_user, get_current_user
from ..models.user import User
from ..models.prediction import Prediction
from ..schemas.metrics import PredictionOut, PredictionsResponse, UserStats

router = APIRouter(prefix="", tags=["predictions", "users"])


@router.get("/predictions", response_model=PredictionsResponse)
def list_predictions(
    type: str | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=200),
    db: Session = Depends(get_db),
):
    q = db.query(Prediction)
    if type:
        q = q.filter(Prediction.type == type)
    rows = q.order_by(Prediction.id.desc()).limit(limit).all()
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
    }


@router.get("/users/stats", response_model=UserStats)
def users_stats(user: User = Depends(get_optional_user), db: Session = Depends(get_db)):
    total = db.query(func.count(Prediction.id)).filter(Prediction.user_id == user.id).scalar() or 0
    rows = db.query(Prediction.type, func.count(Prediction.id)).filter(Prediction.user_id == user.id).group_by(Prediction.type).all()
    by_type = {t: c for t, c in rows}
    last = db.query(func.max(Prediction.created_at)).filter(Prediction.user_id == user.id).scalar()
    return UserStats(
        total_predictions=int(total),
        by_type=by_type,
        last_active=last.isoformat() if last else None,
    )
