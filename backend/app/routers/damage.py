"""Damage (CNN proxy) router — multipart file upload."""
from __future__ import annotations
import json
from datetime import datetime
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from sqlalchemy.orm import Session
from ..deps import get_db, get_optional_user
from ..models.user import User
from ..models.prediction import Prediction
from ..schemas.damage import DamageResponse
from ..services.model_registry import registry, hash_input
from ..services.metrics_service import metrics_service

router = APIRouter(prefix="/predict", tags=["damage"])


@router.post("/damage", response_model=DamageResponse, response_model_by_alias=True)
async def predict_damage(file: UploadFile = File(...), user: User = Depends(get_optional_user), db: Session = Depends(get_db)):
    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=422, detail="Empty file upload")
    cache_key = "damage:" + hash_input({"size": len(file_bytes), "name": file.filename, "hash": hash(file_bytes[:1024])})
    cached = registry.cache_get(cache_key)
    if cached:
        result = cached
    else:
        try:
            result = registry.damage.predict(file_bytes)
        except ValueError as e:
            raise HTTPException(status_code=422, detail=str(e))
        registry.cache_put(cache_key, result)
    metrics_service.record_model("Damage ResNet50-CV", result["latency_ms"])
    try:
        db.add(Prediction(
            user_id=user.id, type="damage",
            input=json.dumps({"filename": file.filename, "size": len(file_bytes)}),
            output=json.dumps(result),
            latency_ms=result["latency_ms"], created_at=datetime.utcnow(),
        ))
        db.commit()
    except Exception:
        db.rollback()
    return result
