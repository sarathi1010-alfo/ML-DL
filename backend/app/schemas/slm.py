"""SLM (Medical Scenario Generator) schemas."""
from __future__ import annotations
from typing import Literal
from pydantic import BaseModel, Field


SpecialtyT = Literal["cardiology", "neurology", "pediatrics", "emergency", "general"]
DifficultyT = Literal["beginner", "intermediate", "advanced"]
ScenarioTypeT = Literal["patient_consultation", "case_discussion", "emergency_response", "differential_diagnosis"]


class ScenarioRequest(BaseModel):
    specialty: SpecialtyT = "general"
    difficulty: DifficultyT = "intermediate"
    scenario_type: ScenarioTypeT = "patient_consultation"


class TerminologyItem(BaseModel):
    term: str
    definition: str
    example: str


class ScenarioResponse(BaseModel):
    scenario: str
    terminology: list[TerminologyItem]
    questions: list[str]
    model: str
    latency_ms: int


class ExplainRequest(BaseModel):
    term: str = Field(..., min_length=1, max_length=200)
    specialty: SpecialtyT = "general"


class ExplainResponse(BaseModel):
    term: str
    explanation: str
    examples: list[str]
    related_terms: list[str]
    model: str
    latency_ms: int


class ConverseRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)
    context: str = ""
    specialty: SpecialtyT = "general"


class ConverseResponse(BaseModel):
    response: str
    corrections: list[str]
    suggestions: list[str]
    model: str
    latency_ms: int
