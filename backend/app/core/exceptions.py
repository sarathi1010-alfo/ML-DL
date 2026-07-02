"""Custom exceptions + global exception handlers."""
from __future__ import annotations
from fastapi import Request
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError


class AppException(Exception):
    """Base application exception."""

    def __init__(self, detail: str, error_code: str = "APP_ERROR", status_code: int = 400):
        self.detail = detail
        self.error_code = error_code
        self.status_code = status_code
        super().__init__(detail)


class NotFoundError(AppException):
    def __init__(self, detail: str):
        super().__init__(detail, error_code="NOT_FOUND", status_code=404)


class AuthError(AppException):
    def __init__(self, detail: str = "Authentication failed"):
        super().__init__(detail, error_code="AUTH_ERROR", status_code=401)


class ModelNotReadyError(AppException):
    def __init__(self, model: str):
        super().__init__(f"Model '{model}' is not ready", error_code="MODEL_NOT_READY", status_code=503)


def _err(detail: str, code: str, status: int) -> JSONResponse:
    return JSONResponse(status_code=status, content={"detail": detail, "error_code": code, "status_code": status})


async def app_exception_handler(request: Request, exc: AppException) -> JSONResponse:
    return _err(exc.detail, exc.error_code, exc.status_code)


async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    return _err(f"Internal server error: {exc}", "INTERNAL_ERROR", 500)


async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    return _err("Validation error: " + "; ".join([f"{'.'.join(str(x) for x in e.get('loc', []))}: {e.get('msg', '')}" for e in exc.errors()]), "VALIDATION_ERROR", 422)
