"""Security helpers: password hashing (bcrypt direct) + JWT (python-jose)."""
from __future__ import annotations
from datetime import datetime, timedelta, timezone
from typing import Any
from jose import jwt, JWTError
import bcrypt
from ..config import settings


def hash_password(password: str) -> str:
    """Hash a password using bcrypt directly (avoids passlib/bcrypt-4.x compat issues)."""
    pw = password.encode("utf-8")
    # bcrypt has a 72-byte limit; truncate to be safe
    if len(pw) > 72:
        pw = pw[:72]
    salt = bcrypt.gensalt(rounds=10)
    return bcrypt.hashpw(pw, salt).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        pw = plain.encode("utf-8")
        if len(pw) > 72:
            pw = pw[:72]
        h = hashed.encode("utf-8")
        return bcrypt.checkpw(pw, h)
    except Exception:
        return False


def create_access_token(subject: str | int, extra: dict[str, Any] | None = None) -> str:
    now = datetime.now(timezone.utc)
    expire = now + timedelta(minutes=settings.access_token_expire_minutes)
    payload = {
        "sub": str(subject),
        "iat": now,
        "exp": expire,
        "type": "access",
    }
    if extra:
        payload.update(extra)
    return jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)


def decode_access_token(token: str) -> dict[str, Any] | None:
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        return payload
    except JWTError:
        return None
