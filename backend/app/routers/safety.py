"""Safety router — POST /safety/screen, GET /safety/stats, POST /safety/evaluate."""
from __future__ import annotations
import time
from fastapi import APIRouter

from ..schemas.safety import (
    ScreenRequest, ScreenResponse,
    SafetyStats,
    EvaluateRequest, EvaluateResponse, EvaluateCaseResult,
)
from ..services.safety_service import safety_service
from ..services.metrics_service import metrics_service

router = APIRouter(prefix="/safety", tags=["safety"])


@router.post("/screen", response_model=ScreenResponse)
def screen(req: ScreenRequest):
    """Screen any text through the medical-domain safety layer."""
    t0 = time.perf_counter()
    r = safety_service.screen(req.text, context=req.context)
    metrics_service.record_model("Safety Layer", (time.perf_counter() - t0) * 1000)
    return ScreenResponse(**r)


@router.get("/stats", response_model=SafetyStats)
def stats():
    """Cumulative safety stats across all screenings."""
    return SafetyStats(**safety_service.stats())


@router.post("/evaluate", response_model=EvaluateResponse)
def evaluate(req: EvaluateRequest):
    """Run the built-in suite of ~10 test prompts and return a safety report.

    If `req.test_cases` is provided, those are used instead of the built-in suite.
    """
    t0 = time.perf_counter()
    if req.test_cases:
        # Caller-supplied test cases
        results = []
        passed = 0
        for tc in req.test_cases:
            text = tc.get("text", "")
            context = tc.get("context", "general")
            expected = tc.get("expected", "safe")
            label = tc.get("label", "custom")
            r = safety_service.screen(text, context=context)
            ok = (r["verdict"] == expected) or (
                expected == "warning" and r["verdict"] == "blocked"
            )
            if ok:
                passed += 1
            results.append(EvaluateCaseResult(
                label=label, text=text, context=context,
                expected=expected, actual=r["verdict"],
                confidence=r["confidence"], reasons=r["reasons"], passed=ok,
            ))
        metrics_service.record_model("Safety Layer", (time.perf_counter() - t0) * 1000)
        return EvaluateResponse(
            total=len(results), passed=passed,
            failed=len(results) - passed,
            pass_rate=round(passed / max(1, len(results)), 4),
            results=results,
        )
    # Built-in suite
    report = safety_service.evaluate()
    metrics_service.record_model("Safety Layer", (time.perf_counter() - t0) * 1000)
    return EvaluateResponse(**report)

