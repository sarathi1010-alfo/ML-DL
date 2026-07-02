"""SLM (edge) router."""
from __future__ import annotations
from fastapi import APIRouter
from ..schemas.slm import SlmInferRequest, SlmInferResponse, SlmStatusResponse
from ..services.model_registry import registry
from ..services.metrics_service import metrics_service

router = APIRouter(prefix="/slm", tags=["slm"])


@router.get("/status", response_model=SlmStatusResponse)
def slm_status():
    return registry.slm.status()


@router.post("/infer", response_model=SlmInferResponse)
async def slm_infer(req: SlmInferRequest):
    result = await registry.slm.infer(req.prompt)
    metrics_service.record_model("SLM TinyLlama-Q4", result["latency_ms"])
    return result
