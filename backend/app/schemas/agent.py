"""Tutor agent schemas."""
from __future__ import annotations
from typing import Any, Literal
from pydantic import BaseModel, Field


SpecialtyT = Literal["cardiology", "neurology", "pediatrics", "emergency", "general"]
LevelT = Literal["A1", "A2", "B1", "B2", "C1", "C2"]


class SafetyInfo(BaseModel):
    """Embedded safety screening result."""
    verdict: Literal["safe", "warning", "blocked"]
    confidence: float
    reasons: list[str] = Field(default_factory=list)
    disclaimers: list[str] = Field(default_factory=list)
    latency_ms: int


class TutorRequest(BaseModel):
    learner_id: str = Field(..., min_length=1, max_length=64)
    task: str = Field(default="Design learning path", max_length=256)
    current_level: LevelT = "B1"
    target_level: LevelT = "C1"
    specialty: SpecialtyT = "general"
    vocabulary_score: float = Field(default=70, ge=0, le=100)
    grammar_score: float = Field(default=70, ge=0, le=100)
    fluency_score: float = Field(default=70, ge=0, le=100)
    comprehension_score: float = Field(default=70, ge=0, le=100)


class AgentStep(BaseModel):
    step: int
    thought: str
    action: str
    action_input: dict[str, Any]
    observation: str
    latency_ms: int


class LearningPath(BaseModel):
    total_steps: int
    estimated_days: int
    focus_areas: list[str]


class TutorResponse(BaseModel):
    status: Literal["completed", "failed"]
    learning_path: LearningPath
    steps: list[AgentStep]
    final_answer: str
    tools_used: list[str]
    total_latency_ms: int
    safety: SafetyInfo | None = None


class AgentLogOut(BaseModel):
    id: int
    learner_id: str
    task: str
    current_level: str | None
    target_level: str | None
    specialty: str | None
    steps_count: int
    status: str
    total_latency_ms: int
    steps: list[dict[str, Any]]
    final_answer: str
    created_at: str


class AgentLogsResponse(BaseModel):
    logs: list[AgentLogOut]
    total: int
