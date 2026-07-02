"""Dependency injection providers."""
from __future__ import annotations
from typing import Generator
from fastapi import Depends, Header, Request
from sqlalchemy.orm import Session
from .database import SessionLocal
from .models.user import User
from .core.security import decode_access_token
from .core.exceptions import AuthError
from .services.auth_service import get_user_by_id, get_user_by_username, seed_admin
from .config import settings


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# Demo fallback user (created at startup; re-fetched lazily)
_DEMO_USERNAME = settings.admin_username


def _resolve_demo_user(db: Session) -> User:
    user = get_user_by_username(db, _DEMO_USERNAME)
    if user is None:
        seed_admin(db)
        user = get_user_by_username(db, _DEMO_USERNAME)
    return user


def get_current_user(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> User:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise AuthError("Missing bearer token")
    token = authorization.split(" ", 1)[1].strip()
    payload = decode_access_token(token)
    if not payload or "sub" not in payload:
        raise AuthError("Invalid or expired token")
    try:
        user_id = int(payload["sub"])
    except (ValueError, TypeError):
        raise AuthError("Invalid token subject")
    user = get_user_by_id(db, user_id)
    if user is None or not user.is_active:
        raise AuthError("User not found or inactive")
    return user


def get_optional_user(
    request: Request,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> User:
    """Returns the authenticated user OR the demo admin (so live UI works w/o login)."""
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
        payload = decode_access_token(token)
        if payload and "sub" in payload:
            try:
                user_id = int(payload["sub"])
                user = get_user_by_id(db, user_id)
                if user is not None and user.is_active:
                    return user
            except (ValueError, TypeError):
                pass
    return _resolve_demo_user(db)
