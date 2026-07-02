"""Request logger middleware — logs each request + records latency into metrics."""
from __future__ import annotations
import time
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from ..core.logging import logger
from ..services.metrics_service import metrics_service


class RequestLoggerMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        start = time.perf_counter()
        path = request.url.path
        method = request.method
        # Skip the noisy health/metrics probes from logs (still counted in metrics)
        try:
            response = await call_next(request)
        except Exception as e:
            latency_ms = (time.perf_counter() - start) * 1000.0
            metrics_service.record_request(path, latency_ms, error=True)
            logger.error(f"{method} {path} -> 500 ({latency_ms:.1f}ms) {e}")
            raise
        latency_ms = (time.perf_counter() - start) * 1000.0
        err = response.status_code >= 400
        metrics_service.record_request(path, latency_ms, error=err)
        if path not in ("/api/v1/health", "/api/v1/metrics"):
            logger.info(f"{method} {path} -> {response.status_code} ({latency_ms:.1f}ms)")
        response.headers["X-Response-Time-ms"] = f"{latency_ms:.2f}"
        return response
