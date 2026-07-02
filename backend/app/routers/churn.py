"""Churn prediction router."""
from __future__ import annotations
import json
from datetime import datetime
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from ..deps import get_db, get_optional_user
from ..models.user import User
from ..models.prediction import Prediction
from ..schemas.churn import ChurnRequest, ChurnResponse
from ..services.model_registry import registry, hash_input
from ..services.metrics_service import metrics_service

router = APIRouter(prefix="/predict", tags=["churn"])


@router.post("/churn", response_model=ChurnResponse)
def predict_churn(req: ChurnRequest, user: User = Depends(get_optional_user), db: Session = Depends(get_db)):
    payload = req.model_dump()
    cache_key = "churn:" + hash_input(payload)
    cached = registry.cache_get(cache_key)
    if cached:
        result = cached
    else:
        result = registry.churn.predict(**payload)
        registry.cache_put(cache_key, result)
    metrics_service.record_model("Churn XGBoost", result["latency_ms"])
    # Persist
    try:
        db.add(Prediction(
            user_id=user.id, type="churn",
            input=json.dumps(payload), output=json.dumps(result),
            latency_ms=result["latency_ms"], created_at=datetime.utcnow(),
        ))
        db.commit()
    except Exception:
        db.rollback()
    return result
