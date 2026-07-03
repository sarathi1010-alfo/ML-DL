"""Proficiency assessment schemas."""
from __future__ import annotations
from typing import Literal
from pydantic import BaseModel, Field


SpecialtyT = Literal["cardiology", "neurology", "pediatrics", "emergency", "general"]


class ProficiencyRequest(BaseModel):
    vocabulary_score: float = Field(..., ge=0, le=100)
    grammar_score: float = Field(..., ge=0, le=100)
    fluency_score: float = Field(..., ge=0, le=100)
    comprehension_score: float = Field(..., ge=0, le=100)
    exercises_completed: float = Field(..., ge=0, le=200)
    study_hours: float = Field(..., ge=0, le=500)
    days_active: float = Field(..., ge=0, le=365)
    specialty: SpecialtyT = "general"


class Recommendation(BaseModel):
    area: str
    priority: Literal["High", "Medium", "Low"]
    action: str


class FeatureImportance(BaseModel):
    feature: str
    importance: float


class ProficiencyResponse(BaseModel):
    level: str
    level_numeric: int
    cefr_scale: dict[str, float]
    confidence: float
    recommendations: list[Recommendation]
    feature_importance: list[FeatureImportance]
    model: str
    latency_ms: int
