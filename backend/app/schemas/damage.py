"""Damage schemas — rich part-level damage assessment response."""
from __future__ import annotations
from pydantic import BaseModel, Field, ConfigDict


class DamageRegion(BaseModel):
    x: float
    y: float
    w: float
    h: float
    type: str
    severity: str | None = None
    confidence: float | None = None
    area_percent: float | None = None
    part: str | None = None


class VehicleRegion(BaseModel):
    x: float
    y: float
    w: float
    h: float
    confidence: float


class PartRegion(BaseModel):
    x: float
    y: float
    w: float
    h: float


class DetectedPart(BaseModel):
    part: str
    region: PartRegion
    damage_detected: bool
    damage_types: list[str]
    severity: str
    condition: str
    structural: bool = False
    is_glass: bool = False
    scores: dict[str, float] = {}


class CostBreakdownItem(BaseModel):
    part: str
    damage_types: list[str]
    labor_hours: float
    labor_cost: float
    parts_cost: float
    paint_cost: float
    total: float


class ImageQuality(BaseModel):
    score: float
    brightness: float
    contrast: float
    blur: float
    resolution: str
    issues: list[str] = []


class DominantColor(BaseModel):
    hex: str
    name: str
    percent: float


class ColorAnalysis(BaseModel):
    dominant_colors: list[DominantColor] = []
    vehicle_color_estimate: str


class RiskAssessment(BaseModel):
    structural_risk: str
    cosmetic_risk: str
    safety_concerns: list[str] = []
    drivable: bool


class DamageResponse(BaseModel):
    # Core (backward-compatible)
    class_: str = Field(alias="class")
    confidence: float
    severity: str
    damage_types: list[str]
    estimated_repair_cost_usd: float
    damage_regions: list[DamageRegion]
    model: str
    latency_ms: int
    # Detailed additions
    severity_score: int = 0
    damage_type_scores: dict[str, float] = {}
    vehicle_region: VehicleRegion | None = None
    detected_parts: list[DetectedPart] = []
    cost_breakdown: list[CostBreakdownItem] = []
    total_labor_hours: float = 0.0
    image_quality: ImageQuality | None = None
    color_analysis: ColorAnalysis | None = None
    risk_assessment: RiskAssessment | None = None
    recommendations: list[str] = []
    analysis_summary: str = ""
    pipeline_stages: list[str] = []
    pipeline_stage_count: int = 0

    model_config = ConfigDict(populate_by_name=True)
