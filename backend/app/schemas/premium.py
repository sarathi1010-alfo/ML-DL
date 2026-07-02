"""Premium schemas."""
from __future__ import annotations
from pydantic import BaseModel, Field


class PremiumRequest(BaseModel):
    age: int = Field(..., ge=18, le=100)
    bmi: float = Field(..., ge=10, le=60)
    smoker: bool
    region: int = Field(..., ge=0, le=3)


class RiskFactor(BaseModel):
    factor: str
    impact: float
    level: str


class PremiumResponse(BaseModel):
    predicted_premium: float
    currency: str = "USD"
    confidence_interval: list[float]
    risk_factors: list[RiskFactor]
    model: str
    latency_ms: int
