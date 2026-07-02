"""Churn schemas."""
from __future__ import annotations
from typing import Literal
from pydantic import BaseModel, Field


class ChurnRequest(BaseModel):
    gender: Literal["Male", "Female"]
    age: int = Field(..., ge=18, le=100)
    contract: Literal["Month-to-month", "One year", "Two year"]
    tenure: int = Field(..., ge=0, le=120)
    monthly_charges: float = Field(..., ge=0, le=1000)


class FeatureContribution(BaseModel):
    feature: str
    contribution: float
    direction: str


class ChurnResponse(BaseModel):
    churn_probability: float
    prediction: str
    risk_level: str
    confidence: float
    feature_contributions: list[FeatureContribution]
    model: str
    latency_ms: int
