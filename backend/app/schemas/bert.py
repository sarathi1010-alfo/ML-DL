"""BERT (complaint classification) schemas."""
from __future__ import annotations
from pydantic import BaseModel, Field


class BertRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=2000)


class CategoryScore(BaseModel):
    label: str
    score: float


class Sentiment(BaseModel):
    label: str
    score: float


class Entity(BaseModel):
    text: str
    type: str


class BertResponse(BaseModel):
    category: str
    confidence: float
    categories: list[CategoryScore]
    sentiment: Sentiment
    urgency: str
    entities: list[Entity]
    model: str
    latency_ms: int
