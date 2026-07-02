"""Damage schemas."""
from __future__ import annotations
from pydantic import BaseModel, Field, ConfigDict


class DamageRegion(BaseModel):
    x: float
    y: float
    w: float
    h: float
    type: str


class DamageResponse(BaseModel):
    class_: str = Field(alias="class")
    confidence: float
    severity: str
    damage_types: list[str]
    estimated_repair_cost_usd: float
    damage_regions: list[DamageRegion]
    model: str
    latency_ms: int

    model_config = ConfigDict(populate_by_name=True)
