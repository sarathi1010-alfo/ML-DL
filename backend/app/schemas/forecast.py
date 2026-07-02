"""Forecast schemas."""
from __future__ import annotations
from pydantic import BaseModel, Field


class ForecastRequest(BaseModel):
    horizon: int = Field(30, ge=1, le=180)
    history: list[float] | None = None


class ForecastPoint(BaseModel):
    day: int
    value: float
    lower: float
    upper: float


class ForecastMetrics(BaseModel):
    mae: float
    rmse: float
    r2: float


class ForecastResponse(BaseModel):
    forecast: list[ForecastPoint]
    metrics: ForecastMetrics
    model: str
    latency_ms: int
