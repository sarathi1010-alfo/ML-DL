"""Application settings (env-driven)."""
from __future__ import annotations
import os
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)


class Settings:
    """Plain settings object (no pydantic-settings, to avoid env-var clashes)."""

    app_name: str = "MediLingua API"
    app_version: str = "2.0.0"
    log_level: str = os.getenv("LOG_LEVEL", "INFO")
    cors_origins: str = "*"

    # Auth
    secret_key: str = os.getenv("SECRET_KEY", "ai-platform-secret-key-change-me")
    algorithm: str = "HS256"
    access_token_expire_minutes: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440"))

    # Database (use PLATFORM_DATABASE_URL to avoid clashing with Next.js's DATABASE_URL env var)
    database_url: str = os.getenv("PLATFORM_DATABASE_URL", f"sqlite:///{DATA_DIR}/platform.db")

    # LLM
    llm_service_url: str = os.getenv("LLM_SERVICE_URL", "http://localhost:3003")

    # Demo admin
    admin_username: str = "admin"
    admin_password: str = "admin123"
    admin_email: str = "admin@ai-platform.local"


settings = Settings()
