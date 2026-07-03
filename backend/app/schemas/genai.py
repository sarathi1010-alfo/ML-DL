"""GenAI content generator schemas."""
from __future__ import annotations
from typing import Literal
from pydantic import BaseModel, Field


SpecialtyT = Literal["cardiology", "neurology", "pediatrics", "emergency", "general"]
DifficultyT = Literal["beginner", "intermediate", "advanced"]
RoleT = Literal["patient", "clinician", "nurse", "specialist"]


class SafetyInfo(BaseModel):
    """Embedded safety screening result."""
    verdict: Literal["safe", "warning", "blocked"]
    confidence: float
    reasons: list[str] = Field(default_factory=list)
    disclaimers: list[str] = Field(default_factory=list)
    latency_ms: int


class CaseStudyRequest(BaseModel):
    specialty: SpecialtyT = "general"
    difficulty: DifficultyT = "intermediate"


class CaseStudyResponse(BaseModel):
    case_study: str
    questions: list[str]
    learning_objectives: list[str]
    model: str
    latency_ms: int
    safety: SafetyInfo | None = None


class QuizRequest(BaseModel):
    specialty: SpecialtyT = "general"
    topic: str = Field(default="general medicine", max_length=200)
    num_questions: int = Field(default=5, ge=1, le=20)
    difficulty: DifficultyT = "intermediate"


class QuizQuestion(BaseModel):
    question: str
    options: list[str]
    answer: int  # index into options
    explanation: str


class QuizResponse(BaseModel):
    questions: list[QuizQuestion]
    model: str
    latency_ms: int
    safety: SafetyInfo | None = None


class SimulationRequest(BaseModel):
    specialty: SpecialtyT = "general"
    role: RoleT = "patient"


class SimulationResponse(BaseModel):
    simulation: str
    model: str
    latency_ms: int
    safety: SafetyInfo | None = None
