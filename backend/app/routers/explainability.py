"""Explainability router — POST /explain/proficiency, /acquisition, /recommendations."""
from __future__ import annotations
import time
from fastapi import APIRouter

from ..schemas.explainability import (
    ProficiencyExplainRequest, ProficiencyExplainResponse, Contribution,
    AcquisitionExplainRequest, AcquisitionExplainResponse, AttentionPoint,
    RecommendationsExplainRequest, RecommendationsExplainResponse, RecommendationReasoning,
)
from ..services.explainability_service import explainability_service
from ..services.metrics_service import metrics_service

router = APIRouter(prefix="/explain", tags=["explainability"])


@router.post("/proficiency", response_model=ProficiencyExplainResponse)
def explain_proficiency(req: ProficiencyExplainRequest):
    """SHAP-style feature contribution explanation for the proficiency assessment."""
    t0 = time.perf_counter()
    r = explainability_service.explain_proficiency(req.input, req.prediction)
    metrics_service.record_model("Explainability", (time.perf_counter() - t0) * 1000)
    return ProficiencyExplainResponse(
        level=r["level"],
        level_numeric=r["level_numeric"],
        top_contributions=[Contribution(**c) for c in r["top_contributions"]],
        all_contributions=[Contribution(**c) for c in r["all_contributions"]],
        summary=r["summary"],
        latency_ms=r["latency_ms"],
    )


@router.post("/acquisition", response_model=AcquisitionExplainResponse)
def explain_acquisition(req: AcquisitionExplainRequest):
    """Attention-weight explanation for the acquisition forecast."""
    t0 = time.perf_counter()
    r = explainability_service.explain_acquisition(req.history, req.forecast)
    metrics_service.record_model("Explainability", (time.perf_counter() - t0) * 1000)
    return AcquisitionExplainResponse(
        attention_weights=[AttentionPoint(**a) for a in r["attention_weights"]],
        top_influencers=[AttentionPoint(**a) for a in r["top_influencers"]],
        n_history_points=r["n_history_points"],
        n_attention_points=r["n_attention_points"],
        summary=r["summary"],
        latency_ms=r["latency_ms"],
    )


@router.post("/recommendations", response_model=RecommendationsExplainResponse)
def explain_recommendations(req: RecommendationsExplainRequest):
    """Natural-language 'why' reasoning for each proficiency recommendation."""
    t0 = time.perf_counter()
    reasoning = explainability_service.explain_recommendations(req.input, req.prediction)
    metrics_service.record_model("Explainability", (time.perf_counter() - t0) * 1000)
    return RecommendationsExplainResponse(
        reasoning=[RecommendationReasoning(**r) for r in reasoning],
    )

