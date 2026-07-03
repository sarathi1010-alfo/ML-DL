"""SLM (Medical Scenario Generator) schemas."""
from __future__ import annotations
from typing import Literal
from pydantic import BaseModel, Field


SpecialtyT = Literal["cardiology", "neurology", "pediatrics", "emergency", "general"]
DifficultyT = Literal["beginner", "intermediate", "advanced"]
ScenarioTypeT = Literal["patient_consultation", "case_discussion", "emergency_response", "differential_diagnosis"]


class SafetyInfo(BaseModel):
    """Embedded safety screening result returned alongside SLM/GenAI/Agent responses."""
    verdict: Literal["safe", "warning", "blocked"]
    confidence: float
    reasons: list[str] = Field(default_factory=list)
    disclaimers: list[str] = Field(default_factory=list)
    latency_ms: int


class ScenarioRequest(BaseModel):
    specialty: SpecialtyT = "general"
    difficulty: DifficultyT = "intermediate"
    scenario_type: ScenarioTypeT = "patient_consultation"


class TerminologyItem(BaseModel):
    term: str
    definition: str
    example: str


class RagSourceRef(BaseModel):
    """Reference to a RAG-retrieved knowledge chunk that grounded the generation."""
    chunk_id: int
    category: str = "general"
    text: str
    score: float
    document_filename: str = ""


class ScenarioResponse(BaseModel):
    scenario: str
    terminology: list[TerminologyItem]
    questions: list[str]
    model: str
    latency_ms: int
    safety: SafetyInfo | None = None
    rag_sources: list[RagSourceRef] = Field(default_factory=list)


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
    safety: SafetyInfo | None = None


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
    safety: SafetyInfo | None = None
