"""Learning acquisition tracking schemas."""
from __future__ import annotations
from typing import Literal
from pydantic import BaseModel, Field


class AcquisitionRequest(BaseModel):
    history: list[float] = Field(..., min_length=2, max_length=1000)
    horizon: int = Field(default=14, ge=1, le=180)


class ForecastPoint(BaseModel):
    day: int
    score: float
    lower: float
    upper: float


class MasteryPrediction(BaseModel):
    target_level: str
    days_to_mastery: int
    probability: float


class OptimalIntervention(BaseModel):
    type: str
    focus_area: str
    expected_boost: float


class ForecastMetrics(BaseModel):
    mae: float
    rmse: float
    r2: float


class AcquisitionResponse(BaseModel):
    forecast: list[ForecastPoint]
    mastery_prediction: MasteryPrediction
    optimal_intervention: OptimalIntervention
    metrics: ForecastMetrics
    model: str
    latency_ms: int
