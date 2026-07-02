"""FastAPI app entrypoint.

Creates the app, configures middleware, registers routers, and runs startup
tasks (init DB, seed admin, warm up models, seed RAG KB).
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
    auth_router, churn_router, premium_router, damage_router,
    forecast_router, bert_router, rag_router, agent_router,
    slm_router, metrics_router, predictions_router,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting AI Engineering Platform API...")
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
    # 3) Warm up core models in background-friendly order
    registry.warm_up()
    # 4) Initialize RAG (seeds default KB)
    try:
        _ = registry.rag
    except Exception as e:
        logger.error(f"RAG init failed: {e}")
    # 5) Initialize SLM
    try:
        _ = registry.slm
    except Exception as e:
        logger.error(f"SLM init failed: {e}")
    # 6) Record start time
    metrics_service.start_time = time.time()
    logger.info("Startup complete.")
    yield
    logger.info("Shutting down.")


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="Production-grade AI Engineering Platform backend (FastAPI).",
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
    auth_router, churn_router, premium_router, damage_router,
    forecast_router, bert_router, rag_router, agent_router,
    slm_router, metrics_router, predictions_router,
):
    app.include_router(r, prefix=API_PREFIX)


@app.get("/")
def root():
    return {"name": settings.app_name, "version": settings.app_version, "docs": "/docs", "api": API_PREFIX}
