"""Auth service: user CRUD + JWT issuing."""
from __future__ import annotations
from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy import select
from ..core.security import hash_password, verify_password, create_access_token
from ..core.exceptions import AuthError, AppException
from ..models.user import User
from ..schemas.auth import LoginRequest, RegisterRequest, UserOut
from ..config import settings


def get_user_by_username(db: Session, username: str) -> User | None:
    return db.execute(select(User).where(User.username == username)).scalar_one_or_none()


def get_user_by_email(db: Session, email: str) -> User | None:
    return db.execute(select(User).where(User.email == email)).scalar_one_or_none()


def get_user_by_id(db: Session, user_id: int) -> User | None:
    return db.get(User, user_id)


def register_user(db: Session, req: RegisterRequest) -> tuple[User, str]:
    if get_user_by_username(db, req.username):
        raise AppException("Username already taken", "CONFLICT", 409)
    if get_user_by_email(db, req.email):
        raise AppException("Email already registered", "CONFLICT", 409)
    user = User(
        username=req.username,
        email=req.email,
        hashed_password=hash_password(req.password),
        role="user",
        specialty=getattr(req, "specialty", None) or "general",
        is_active=True,
        created_at=datetime.utcnow(),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    token = create_access_token(user.id, extra={"username": user.username, "role": user.role})
    return user, token


def login_user(db: Session, req: LoginRequest) -> tuple[User, str]:
    user = get_user_by_username(db, req.username)
    if not user or not verify_password(req.password, user.hashed_password):
        raise AuthError("Invalid username or password")
    if not user.is_active:
        raise AuthError("Account disabled")
    token = create_access_token(user.id, extra={"username": user.username, "role": user.role})
    return user, token


def seed_admin(db: Session) -> None:
    """Idempotently seed the demo admin user."""
    admin = get_user_by_username(db, settings.admin_username)
    if admin is None:
        admin = User(
            username=settings.admin_username,
            email=settings.admin_email,
            hashed_password=hash_password(settings.admin_password),
            role="admin",
            specialty="general",
            is_active=True,
            created_at=datetime.utcnow(),
        )
        db.add(admin)
        db.commit()
