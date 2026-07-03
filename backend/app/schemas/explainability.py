"""Explainability schemas — for /api/v1/explain/* endpoints."""
from __future__ import annotations
from typing import Any
from pydantic import BaseModel, Field


# --------------------------------------------------------------------------- #
# POST /explain/proficiency
# --------------------------------------------------------------------------- #
class ProficiencyExplainRequest(BaseModel):
    input: dict[str, Any]
    prediction: dict[str, Any]


class Contribution(BaseModel):
    feature: str
    label: str
    importance: float
    value: float
    scaled_value: float
    direction: str  # "increases" | "decreases" | "neutral"
    contribution: float
    explanation: str


class ProficiencyExplainResponse(BaseModel):
    level: str
    level_numeric: int
    top_contributions: list[Contribution]
    all_contributions: list[Contribution]
    summary: str
    latency_ms: int


# --------------------------------------------------------------------------- #
# POST /explain/acquisition
# --------------------------------------------------------------------------- #
class AcquisitionExplainRequest(BaseModel):
    history: list[float] = Field(default_factory=list)
    # `forecast` may be EITHER:
    #   - a full AcquisitionResponse dict (with a `forecast` list of ForecastPoints), OR
    #   - a bare list of ForecastPoint dicts.
    forecast: Any = Field(default_factory=dict)


class AttentionPoint(BaseModel):
    index: int
    score: float
    weight: float
    day_offset: int
    rank: int
    explanation: str


class AcquisitionExplainResponse(BaseModel):
    attention_weights: list[AttentionPoint]
    top_influencers: list[AttentionPoint]
    n_history_points: int
    n_attention_points: int
    summary: str
    latency_ms: int


# --------------------------------------------------------------------------- #
# POST /explain/recommendations
# --------------------------------------------------------------------------- #
class RecommendationsExplainRequest(BaseModel):
    input: dict[str, Any]
    prediction: dict[str, Any]


class RecommendationReasoning(BaseModel):
    area: str
    priority: str
    action: str
    why: str
    feature_importance_pct: float | None
    gap_vs_threshold: float | None
    latency_ms: int


class RecommendationsExplainResponse(BaseModel):
    reasoning: list[RecommendationReasoning]
