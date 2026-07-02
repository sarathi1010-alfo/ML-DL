"""Metrics service — in-memory store for API usage, latency, errors, model metrics."""
from __future__ import annotations
import time
import threading
from collections import defaultdict, deque
from datetime import datetime, timezone


class MetricsService:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self.start_time = time.time()
        self.total_requests = 0
        self.success_requests = 0
        self.error_requests = 0
        self.endpoint_calls: dict[str, int] = defaultdict(int)
        self.endpoint_errors: dict[str, int] = defaultdict(int)
        self.endpoint_latency_sum: dict[str, float] = defaultdict(float)
        self.latency_samples: deque[float] = deque(maxlen=500)
        self.model_calls: dict[str, int] = defaultdict(int)
        self.model_latency_sum: dict[str, float] = defaultdict(float)
        self.model_errors: dict[str, int] = defaultdict(int)
        # 24-point time series (last 24 minutes)
        self.time_series: deque[dict] = deque(maxlen=24)
        self._last_bucket = -1

    def _bucket(self) -> int:
        return int(time.time() // 60)  # 1-min buckets

    def _tick_bucket(self) -> None:
        b = self._bucket()
        if b != self._last_bucket:
            self._last_bucket = b
            self.time_series.append({
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "requests": 0,
                "latency_ms": 0.0,
                "errors": 0,
            })

    def record_request(self, path: str, latency_ms: float, error: bool = False) -> None:
        with self._lock:
            self._tick_bucket()
            self.total_requests += 1
            self.endpoint_calls[path] += 1
            self.endpoint_latency_sum[path] += latency_ms
            self.latency_samples.append(latency_ms)
            if error:
                self.error_requests += 1
                self.endpoint_errors[path] += 1
            else:
                self.success_requests += 1
            if self.time_series:
                ts = self.time_series[-1]
                ts["requests"] += 1
                ts["latency_ms"] = (ts["latency_ms"] * (ts["requests"] - 1) + latency_ms) / ts["requests"]
                if error:
                    ts["errors"] += 1

    def record_model(self, model: str, latency_ms: float, error: bool = False) -> None:
        with self._lock:
            self.model_calls[model] += 1
            self.model_latency_sum[model] += latency_ms
            if error:
                self.model_errors[model] += 1

    def percentile(self, samples: list[float], p: float) -> float:
        if not samples:
            return 0.0
        s = sorted(samples)
        k = max(0, min(len(s) - 1, int((p / 100) * (len(s) - 1))))
        return float(s[k])

    def get_latency_p(self, p: float) -> float:
        with self._lock:
            samples = list(self.latency_samples)
        return self.percentile(samples, p)

    def uptime_seconds(self) -> float:
        return time.time() - self.start_time

    def requests_per_min(self) -> float:
        up = max(1.0, self.uptime_seconds())
        return (self.total_requests / up) * 60.0

    def success_rate(self) -> float:
        if self.total_requests == 0:
            return 1.0
        return self.success_requests / self.total_requests

    def error_rate(self) -> float:
        if self.total_requests == 0:
            return 0.0
        return self.error_requests / self.total_requests

    def snapshot(self) -> dict:
        with self._lock:
            endpoints = []
            for path, calls in self.endpoint_calls.items():
                avg = (self.endpoint_latency_sum[path] / calls) if calls else 0.0
                errs = self.endpoint_errors.get(path, 0)
                endpoints.append({
                    "path": path,
                    "calls": calls,
                    "avg_latency_ms": round(avg, 2),
                    "error_rate": round(errs / calls, 4) if calls else 0.0,
                })
            ts = list(self.time_series)
            models_snapshot = {
                m: {
                    "calls": c,
                    "latency_sum": self.model_latency_sum[m],
                    "errors": self.model_errors.get(m, 0),
                } for m, c in self.model_calls.items()
            }
            total = self.total_requests
            success = self.success_requests
            errors = self.error_requests
        return {
            "total_requests": total,
            "success_requests": success,
            "error_requests": errors,
            "endpoints": endpoints,
            "time_series": ts,
            "models": models_snapshot,
        }


metrics_service = MetricsService()
