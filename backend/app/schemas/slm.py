"""SLM schemas."""
from __future__ import annotations
from pydantic import BaseModel, Field


class SlmInferRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=4000)


class SlmInferResponse(BaseModel):
    response: str
    latency_ms: int
    tokens: int
    tokens_per_sec: float


class SlmStatusResponse(BaseModel):
    model: str
    quantization: str
    size_mb: float
    avg_latency_ms: float
    devices: list[str]
    memory_mb: float
    status: str
