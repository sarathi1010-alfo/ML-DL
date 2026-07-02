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
    backend: str = "llm"
    model: str = "TinyLlama-1.1B-Q4"
    quantization: str = "Q4_0 GGUF"


class EdgeDevice(BaseModel):
    id: str
    hostname: str
    cpu: str
    cores: int


class SlmStatusResponse(BaseModel):
    model: str
    quantization: str
    size_mb: float
    context_window: int = 2048
    avg_latency_ms: float
    peak_latency_ms: float = 0.0
    avg_tokens_per_sec: float = 0.0
    avg_tokens_per_call: float = 0.0
    total_inferences: int = 0
    total_tokens_generated: int = 0
    error_count: int = 0
    uptime_seconds: float = 0.0
    memory_mb: float
    cpu_percent: float = 0.0
    llm_backend: str = "connected"
    status: str
    device: EdgeDevice | None = None
    # Back-compat
    devices: list[str] = []
    memory_mb_static: float = 0.0
