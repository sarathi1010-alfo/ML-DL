"""Metrics schemas."""
from __future__ import annotations
from typing import Any
from pydantic import BaseModel


class HealthResponse(BaseModel):
    status: str
    version: str
    uptime_seconds: float
    models: dict[str, str]
    database: str
    llm_service: str


class ApiUsage(BaseModel):
    total_requests: int
    requests_per_min: float
    success_rate: float


class LatencyStats(BaseModel):
    p50_ms: float
    p95_ms: float
    p99_ms: float


class ModelMetricOut(BaseModel):
    model: str
    accuracy: float
    f1: float
    rmse: float
    latency_ms: int
    calls: int
    error_rate: float
    status: str


class SystemStats(BaseModel):
    cpu_percent: float
    memory_percent: float
    disk_percent: float


class EndpointStat(BaseModel):
    path: str
    calls: int
    avg_latency_ms: float
    error_rate: float


class TimeSeriesPoint(BaseModel):
    timestamp: str
    requests: int
    latency_ms: float
    errors: int


class MetricsResponse(BaseModel):
    api_usage: ApiUsage
    latency: LatencyStats
    error_rate: float
    model_metrics: list[ModelMetricOut]
    system: SystemStats
    endpoints: list[EndpointStat]
    time_series: list[TimeSeriesPoint]


class PredictionOut(BaseModel):
    id: int
    type: str
    input: Any
    output: Any
    created_at: str
    latency_ms: int


class PredictionsResponse(BaseModel):
    predictions: list[PredictionOut]


class UserStats(BaseModel):
    total_predictions: int
    by_type: dict[str, int]
    last_active: str | None
