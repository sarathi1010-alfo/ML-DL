"""Safety schemas — for /api/v1/safety/* endpoints."""
from __future__ import annotations
from typing import Any, Literal
from pydantic import BaseModel, Field


VerdictT = Literal["safe", "warning", "blocked"]


# --------------------------------------------------------------------------- #
# POST /safety/screen
# --------------------------------------------------------------------------- #
class ScreenRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=20000)
    context: str = Field(default="general", max_length=64)


class ScreenResponse(BaseModel):
    safe: bool
    verdict: VerdictT
    confidence: float
    reasons: list[str]
    disclaimers: list[str]
    filtered_text: str
    latency_ms: int
    context: str


# --------------------------------------------------------------------------- #
# GET /safety/stats
# --------------------------------------------------------------------------- #
class SafetyStats(BaseModel):
    total_screened: int
    blocked_count: int
    warning_count: int
    safe_count: int
    avg_confidence: float
    top_categories: list[tuple[str, int]] = Field(default_factory=list)


# --------------------------------------------------------------------------- #
# POST /safety/evaluate
# --------------------------------------------------------------------------- #
class EvaluateRequest(BaseModel):
    # Allowing optional body so callers can POST {} and get the built-in suite
    test_cases: list[dict[str, Any]] | None = None


class EvaluateCaseResult(BaseModel):
    label: str
    text: str
    context: str
    expected: str
    actual: str
    confidence: float
    reasons: list[str]
    passed: bool


class EvaluateResponse(BaseModel):
    total: int
    passed: int
    failed: int
    pass_rate: float
    results: list[EvaluateCaseResult]
