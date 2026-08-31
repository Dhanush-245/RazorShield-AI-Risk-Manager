import logging
import uuid
from collections.abc import Awaitable, Callable
from contextlib import asynccontextmanager
from time import perf_counter

from fastapi import FastAPI, Request, Response
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.v1.router import api_router
from app.core.config import get_settings
from app.core.logging import configure_logging
from app.core.rate_limit import (
    RateLimitBackendUnavailable,
    RedisSlidingWindowLimiter,
    SlidingWindowLimiter,
)
from app.database.base import Base
from app.database.session import SessionLocal, engine
from app.services.operational_metrics import operational_metrics
from app.services.seed import seed_demo

settings = get_settings()
settings.validate_runtime_secrets()
configure_logging(settings.log_level)
logger = logging.getLogger(__name__)
auth_limiter = (
    RedisSlidingWindowLimiter(settings.rate_limit_backend, settings.auth_rate_limit_per_minute)
    if settings.rate_limit_backend.lower().startswith(("redis://", "rediss://"))
    else SlidingWindowLimiter(settings.auth_rate_limit_per_minute)
)


def apply_security_headers(response: Response, request: Request) -> Response:
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    response.headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'"
    if request.url.path.startswith(("/api/auth/", "/api/v1/auth/")):
        response.headers["Cache-Control"] = "no-store"
    if settings.environment == "production":
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response


@asynccontextmanager
async def lifespan(_app: FastAPI):
    if settings.environment == "development":
        Base.metadata.create_all(engine)
        if settings.auto_seed_demo:
            with SessionLocal() as db:
                seed_demo(db)
    yield


app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    docs_url="/docs" if settings.environment != "production" else None,
    redoc_url=None,
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
)


@app.middleware("http")
async def request_context(request: Request, call_next: Callable[[Request], Awaitable[Response]]) -> Response:
    started = perf_counter()
    request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
    request.state.request_id = request_id
    content_length = request.headers.get("content-length")
    if content_length:
        try:
            request_bytes = int(content_length)
        except ValueError:
            request_bytes = settings.maximum_request_bytes + 1
        if request_bytes > settings.maximum_request_bytes:
            return apply_security_headers(
                JSONResponse(
                    status_code=413,
                    content={
                        "error": {
                            "code": "REQUEST_TOO_LARGE",
                            "message": "Request body exceeds the configured size limit.",
                        },
                        "request_id": request_id,
                    },
                    headers={"X-Request-ID": request_id},
                ),
                request,
            )
    if request.url.path.startswith(("/api/auth/", "/api/v1/auth/")):
        client_host = request.client.host if request.client else "unknown"
        try:
            allowed = auth_limiter.allow(f"{client_host}:{request.url.path}")
        except RateLimitBackendUnavailable:
            return apply_security_headers(
                JSONResponse(
                    status_code=503,
                    content={
                        "error": {
                            "code": "AUTH_PROTECTION_UNAVAILABLE",
                            "message": "Authentication is temporarily unavailable.",
                        },
                        "request_id": request_id,
                    },
                    headers={"Retry-After": "5", "X-Request-ID": request_id},
                ),
                request,
            )
        if not allowed:
            return apply_security_headers(
                JSONResponse(
                    status_code=429,
                    content={
                        "error": {
                            "code": "RATE_LIMITED",
                            "message": "Too many requests. Try again shortly.",
                        },
                        "request_id": request_id,
                    },
                    headers={"Retry-After": "60", "X-Request-ID": request_id},
                ),
                request,
            )
    try:
        response = await call_next(request)
    except Exception:
        operational_metrics.record(500, (perf_counter() - started) * 1000)
        raise
    operational_metrics.record(response.status_code, (perf_counter() - started) * 1000)
    response.headers["X-Request-ID"] = request_id
    apply_security_headers(response, request)
    logger.info(
        "request_completed",
        extra={
            "request_id": request_id,
            "method": request.method,
            "path": request.url.path,
            "status_code": response.status_code,
        },
    )
    return response


@app.exception_handler(RequestValidationError)
async def validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
    return JSONResponse(
        status_code=422,
        content={
            "error": {
                "code": "VALIDATION_ERROR",
                "message": "The request contains invalid fields.",
                "details": jsonable_encoder(exc.errors()),
            },
            "request_id": getattr(request.state, "request_id", None),
        },
    )


app.include_router(api_router, prefix=settings.api_v1_prefix)
app.include_router(api_router, prefix="/api")
