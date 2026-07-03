"""Learning acquisition tracker router — POST /track/acquisition."""
from __future__ import annotations
import json
import time
from datetime import datetime
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from ..deps import get_db, get_optional_user
from ..models.user import User
from ..models.learning_session import LearningSession
from ..schemas.tracking import AcquisitionRequest, AcquisitionResponse
from ..services.model_registry import registry, hash_input
from ..services.metrics_service import metrics_service

router = APIRouter(prefix="/track", tags=["tracking"])


@router.post("/acquisition", response_model=AcquisitionResponse)
def acquisition(
    req: AcquisitionRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_optional_user),
):
    payload = req.model_dump()
    cache_key = "acquisition:" + hash_input(payload)
    cached = registry.cache_get(cache_key)
    if cached:
        result = cached
    else:
        t0 = time.perf_counter()
        result = registry.acquisition.predict(payload)
        elapsed = (time.perf_counter() - t0) * 1000
        metrics_service.record_model("Acquisition LightGBM+Attn", elapsed)
        registry.cache_put(cache_key, result)
    try:
        session = LearningSession(
            user_id=user.id if user else None,
            type="acquisition",
            input=json.dumps(payload, default=str),
            output=json.dumps(result, default=str),
            latency_ms=int(result.get("latency_ms", 0)),
            created_at=datetime.utcnow(),
        )
        db.add(session)
        db.commit()
    except Exception:
        db.rollback()
    return AcquisitionResponse(**result)
