"""SLM (Small Language Model) edge inference simulator.

Status returns TinyLlama-1.1B-Q4 GGUF info. /infer calls the real LLM client
and falls back to a templated summarization if the LLM is unavailable. Tracks
avg latency over the last 50 calls.
"""
from __future__ import annotations
import time
import re
from collections import deque
from .llm_client import llm_client
from ..core.logging import logger


class SlmService:
    MODEL_NAME = "TinyLlama-1.1B-Q4"
    QUANTIZATION = "Q4_0 GGUF"
    SIZE_MB = 670.0
    MEMORY_MB = 740.0
    DEVICES = ["edge-cpu-01"]

    def __init__(self) -> None:
        self._latencies: deque[float] = deque(maxlen=50)

    def status(self) -> dict:
        avg = sum(self._latencies) / len(self._latencies) if self._latencies else 1840.0
        return {
            "model": self.MODEL_NAME,
            "quantization": self.QUANTIZATION,
            "size_mb": self.SIZE_MB,
            "avg_latency_ms": round(avg, 1),
            "devices": list(self.DEVICES),
            "memory_mb": self.MEMORY_MB,
            "status": "loaded",
        }

    def _fallback(self, prompt: str) -> str:
        """Templated summarization fallback."""
        sents = re.split(r"(?<=[.!?])\s+", prompt.strip())
        sents = [s for s in sents if s.strip()]
        if not sents:
            return "[edge-slm] (offline summary) No content to summarize."
        if len(sents) <= 2:
            return f"[edge-slm] Summary: {sents[0]}"
        first = sents[0]
        last = sents[-1]
        return f"[edge-slm] Summary: {first} ... {last} ({len(sents)} sentences processed)."

    async def infer(self, prompt: str) -> dict:
        t0 = time.perf_counter()
        response = ""
        try:
            if llm_client.is_available():
                response = await llm_client.chat(
                    prompt,
                    system="You are TinyLlama, a small edge language model. Answer concisely.",
                    max_tokens=128,
                )
        except Exception:
            response = ""
        if not response or not response.strip():
            response = self._fallback(prompt)
        latency_ms = int((time.perf_counter() - t0) * 1000)
        self._latencies.append(float(latency_ms))
        # Estimate tokens (whitespace split, min 1)
        tokens = max(1, len(response.split()))
        tps = tokens / max(0.001, latency_ms / 1000.0)
        return {
            "response": response.strip(),
            "latency_ms": latency_ms,
            "tokens": tokens,
            "tokens_per_sec": round(tps, 2),
        }


slm_service = SlmService()
