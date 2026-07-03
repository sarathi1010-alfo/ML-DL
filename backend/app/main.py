"""FastAPI app entrypoint — MediLingua backend.

Creates the app, configures middleware, registers routers, and runs startup
tasks (init DB, seed admin, warm up models, record start time).
"""
from __future__ import annotations
import time
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError

from .config import settings
from .core.logging import logger
from .core.exceptions import (
    AppException, app_exception_handler, unhandled_exception_handler,
    validation_exception_handler,
)
from .database import init_db, SessionLocal
from .services.auth_service import seed_admin
from .services.model_registry import registry
from .services.metrics_service import metrics_service
from .middleware.request_logger import RequestLoggerMiddleware
from .middleware.rate_limit import RateLimitMiddleware
from .routers import (
    auth_router, assess_router, track_router, analyze_router,
    slm_router, genai_router, agent_router,
    metrics_router, predictions_router,
    safety_router, explainability_router,
    rag_router,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting MediLingua API...")
    # 1) Init DB
    init_db()
    logger.info("Database initialized.")
    # 2) Seed admin user
    db = SessionLocal()
    try:
        seed_admin(db)
        logger.info("Admin user seeded.")
    finally:
        db.close()
    # 3) Warm up core ML models (proficiency, acquisition, nlp) + init services
    registry.warm_up()
    # 4) Record start time
    metrics_service.start_time = time.time()
    logger.info("Startup complete.")
    yield
    logger.info("Shutting down.")


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="MediLingua — Personalized Language Learning for Medical Professionals (Problem Statement 105).",
    lifespan=lifespan,
)

# CORS (allow all for demo)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Rate limiter (generous for demo)
app.add_middleware(RateLimitMiddleware, max_requests=300, window_seconds=60)

# Request logger (outermost so it captures everything)
app.add_middleware(RequestLoggerMiddleware)

# Exception handlers
app.add_exception_handler(AppException, app_exception_handler)
app.add_exception_handler(RequestValidationError, validation_exception_handler)
app.add_exception_handler(Exception, unhandled_exception_handler)


# Routers — all under /api/v1
API_PREFIX = "/api/v1"
for r in (
    auth_router, assess_router, track_router, analyze_router,
    slm_router, genai_router, agent_router,
    metrics_router, predictions_router,
    safety_router, explainability_router,
    rag_router,
):
    app.include_router(r, prefix=API_PREFIX)


@app.get("/")
def root():
    return {
        "name": settings.app_name,
        "version": settings.app_version,
        "docs": "/docs",
        "api": API_PREFIX,
        "problem_statement": 105,
    }
