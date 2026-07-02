"""Agent schemas."""
from __future__ import annotations
from typing import Any
from pydantic import BaseModel, Field


class AgentRequest(BaseModel):
    task: str = Field(..., min_length=1, max_length=500)
    employee_name: str | None = None
    role: str | None = None
    department: str | None = None


class AgentStep(BaseModel):
    step: int
    thought: str
    action: str
    action_input: Any
    observation: str
    latency_ms: int


class AgentResponse(BaseModel):
    status: str
    final_answer: str
    steps: list[AgentStep]
    tools_used: list[str]
    total_latency_ms: int


class AgentLogOut(BaseModel):
    id: int
    task: str
    employee: str | None
    steps_count: int
    status: str
    created_at: str
    total_latency_ms: int


class AgentLogsResponse(BaseModel):
    logs: list[AgentLogOut]
