"""NLP communication analyzer schemas."""
from __future__ import annotations
from typing import Literal
from pydantic import BaseModel, Field


ContextT = Literal["patient_history", "diagnosis", "treatment_plan", "case_presentation", "general"]


class CommunicationRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=5000)
    context: ContextT = "general"


class GrammarError(BaseModel):
    error: str
    position: str
    correction: str
    severity: Literal["low", "medium", "high"]


class Sentiment(BaseModel):
    label: Literal["Positive", "Neutral", "Negative"]
    score: float


class MedicalEntity(BaseModel):
    text: str
    type: str
    icd_hint: str


class Readability(BaseModel):
    score: float
    grade_level: str
    clarity: str


class CommunicationResponse(BaseModel):
    grammar_errors: list[GrammarError]
    sentiment: Sentiment
    medical_entities: list[MedicalEntity]
    readability: Readability
    feedback: str
    suggestions: list[str]
    communication_score: int
    model: str
    latency_ms: int
