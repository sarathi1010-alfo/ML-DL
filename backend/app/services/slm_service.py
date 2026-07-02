"""SLM (Small Language Model) edge inference simulator.

Status returns TinyLlama-1.1B-Q4 GGUF info with LIVE call statistics
(total inferences, avg/peak latency, total tokens, avg tokens/sec, uptime).
/infer calls the real LLM client and falls back to a templated summarization
if the LLM is unavailable. All metrics are computed from actual inference runs.
"""
from __future__ import annotations
import time
import re
import platform
from collections import deque
from .llm_client import llm_client
from ..core.logging import logger


class SlmService:
    MODEL_NAME = "TinyLlama-1.1B-Q4"
    QUANTIZATION = "Q4_0 GGUF"
    # Static model artifacts (the GGUF file itself doesn't change at runtime)
    SIZE_MB = 670.0
    CONTEXT_WINDOW = 2048
    # Baseline memory footprint when the model is resident (constant for the sim)
    BASE_MEMORY_MB = 740.0

    def __init__(self) -> None:
        self._latencies: deque[float] = deque(maxlen=50)
        self._tokens: deque[int] = deque(maxlen=50)
        self._tps: deque[float] = deque(maxlen=50)
        self._total_calls = 0
        self._total_tokens = 0
        self._errors = 0
        self._loaded_at = time.time()
        # The "edge device" is the host running this service — report it truthfully.
        self._device = {
            "id": "edge-cpu-01",
            "hostname": platform.node(),
            "cpu": platform.processor() or platform.machine() or "unknown",
            "cores": self._cpu_count(),
        }

    @staticmethod
    def _cpu_count() -> int:
        try:
            import os
            return os.cpu_count() or 1
        except Exception:
            return 1

    def _memory_mb(self) -> float:
        """Live resident memory of this process in MB (real)."""
        try:
            import psutil, os
            return round(psutil.Process(os.getpid()).memory_info().rss / (1024 * 1024), 1)
        except Exception:
            return self.BASE_MEMORY_MB

    def _cpu_percent(self) -> float:
        try:
            import psutil
            return round(psutil.cpu_percent(interval=None), 1)
        except Exception:
            return 0.0

    def status(self) -> dict:
        n = len(self._latencies)
        avg = (sum(self._latencies) / n) if n else 0.0
        peak = max(self._latencies) if n else 0.0
        avg_tps = (sum(self._tps) / n) if n else 0.0
        avg_tokens = (sum(self._tokens) / n) if n else 0.0
        uptime = time.time() - self._loaded_at
        # Status reflects whether the LLM backend is reachable
        llm_ok = llm_client.is_available()
        status = "loaded" if llm_ok else "degraded"
        return {
            "model": self.MODEL_NAME,
            "quantization": self.QUANTIZATION,
            "size_mb": self.SIZE_MB,
            "context_window": self.CONTEXT_WINDOW,
            "avg_latency_ms": round(avg, 1),
            "peak_latency_ms": round(peak, 1),
            "avg_tokens_per_sec": round(avg_tps, 2),
            "avg_tokens_per_call": round(avg_tokens, 1),
            "total_inferences": self._total_calls,
            "total_tokens_generated": self._total_tokens,
            "error_count": self._errors,
            "uptime_seconds": round(uptime, 1),
            "memory_mb": self._memory_mb(),
            "cpu_percent": self._cpu_percent(),
            "llm_backend": "connected" if llm_ok else "disconnected",
            "status": status,
            "device": self._device,
            # Back-compat fields (older frontend expected these flat keys)
            "devices": [self._device["id"]],
            "memory_mb_static": self.BASE_MEMORY_MB,
        }

    def _fallback(self, prompt: str) -> str:
        """Templated summarization fallback when the LLM is unavailable."""
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
        backend = "fallback"
        try:
            if llm_client.is_available():
                response = await llm_client.chat(
                    prompt,
                    system="You are TinyLlama, a small edge language model. Answer concisely.",
                    max_tokens=128,
                )
                if response and response.strip():
                    backend = "llm"
        except Exception:
            response = ""
        if not response or not response.strip():
            response = self._fallback(prompt)
            self._errors += 1
        latency_ms = int((time.perf_counter() - t0) * 1000)
        # Token count: whitespace split (rough, min 1)
        tokens = max(1, len(response.split()))
        tps = tokens / max(0.001, latency_ms / 1000.0)
        # Record live stats
        self._latencies.append(float(latency_ms))
        self._tokens.append(tokens)
        self._tps.append(round(tps, 2))
        self._total_calls += 1
        self._total_tokens += tokens
        return {
            "response": response.strip(),
            "latency_ms": latency_ms,
            "tokens": tokens,
            "tokens_per_sec": round(tps, 2),
            "backend": backend,
            "model": self.MODEL_NAME,
            "quantization": self.QUANTIZATION,
        }


slm_service = SlmService()
