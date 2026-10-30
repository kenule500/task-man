"""HTTP surface: one analysis route and a health check, nothing else."""

from __future__ import annotations

import json
import logging
import os
import time
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Header, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from .analyze import analyze
from .auth import authorize
from .config import DEVELOPMENT, SDK_VERSION, Settings, load_settings
from .contracts import AnalyzeRequest, AnalyzeResponse, AnalyzerError
from .limits import Limiter, with_timeout

logger = logging.getLogger("document_analyzer")


def _log(event: str, **fields: object) -> None:
    logger.info(json.dumps({"event": event, **fields}, separators=(",", ":")))


def _request_id(request: Request) -> str:
    return (request.headers.get("x-request-id") or "unknown")[:64]


def _error(
    request: Request,
    status: int,
    code: str,
    message: str,
    retry_after: int | None = None,
) -> JSONResponse:
    headers = {"Retry-After": str(retry_after)} if retry_after else None
    return JSONResponse(
        status_code=status,
        content={"requestId": _request_id(request), "code": code, "message": message},
        headers=headers,
    )


def create_app(settings: Settings | None = None) -> FastAPI:
    environment = settings.environment if settings else os.getenv("ANALYZER_ENV", DEVELOPMENT)
    production = environment.lower() != DEVELOPMENT

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        active = settings or load_settings()
        app.state.settings = active
        app.state.limiter = Limiter(active.max_concurrency)
        logging.basicConfig(level=logging.INFO)
        _log(
            "startup",
            environment=active.environment,
            provider=active.provider,
            model=active.model,
            maxChars=active.max_chars,
            maxConcurrency=active.max_concurrency,
            timeoutSeconds=active.timeout_seconds,
        )
        yield

    app = FastAPI(
        title="TaskMan document analyzer",
        version=SDK_VERSION,
        docs_url=None if production else "/docs",
        redoc_url=None,
        openapi_url=None if production else "/openapi.json",
        lifespan=lifespan,
    )

    @app.middleware("http")
    async def guard(request: Request, call_next):
        active = getattr(request.app.state, "settings", None)
        if active is not None:
            raw = request.headers.get("content-length")
            if raw:
                try:
                    length = int(raw)
                except ValueError:
                    length = 0
                if length > active.max_bytes:
                    return _error(
                        request,
                        413,
                        "ANALYZER_BODY_TOO_LARGE",
                        "The request body is too large.",
                    )
        response = await call_next(request)
        response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        return response

    def require_token(
        request: Request, authorization: str | None = Header(default=None)
    ) -> None:
        active = getattr(request.app.state, "settings", None) or settings or load_settings()
        authorize(authorization, active)

    @app.exception_handler(AnalyzerError)
    async def on_analyzer_error(request: Request, exc: AnalyzerError) -> JSONResponse:
        return _error(request, exc.status, exc.code, exc.message, exc.retry_after)

    @app.exception_handler(RequestValidationError)
    async def on_validation_error(
        request: Request, _exc: RequestValidationError
    ) -> JSONResponse:
        return _error(
            request,
            422,
            "ANALYZER_INVALID_REQUEST",
            "The request does not match contractVersion 1.",
        )

    @app.exception_handler(Exception)
    async def on_unexpected(request: Request, exc: Exception) -> JSONResponse:
        _log("unexpected", error=type(exc).__name__)
        return _error(
            request,
            502,
            "ANALYZER_UNAVAILABLE",
            "The analyzer failed unexpectedly. Try again.",
        )

    @app.get("/healthz")
    async def healthz() -> dict[str, str]:
        return {"status": "ok", "sdkVersion": SDK_VERSION}

    @app.post("/v1/plans:analyze", response_model=AnalyzeResponse)
    async def analyze_route(
        request: Request,
        payload: AnalyzeRequest,
        _: None = Depends(require_token),
    ) -> AnalyzeResponse:
        active: Settings = getattr(request.app.state, "settings", None) or settings or load_settings()
        limiter: Limiter = getattr(request.app.state, "limiter", None) or Limiter(
            active.max_concurrency
        )
        started = time.monotonic()
        try:
            async with limiter.slot():
                result = await with_timeout(analyze(payload, active), active.timeout_seconds)
        except AnalyzerError as error:
            _log(
                "analyze_failed",
                requestId=payload.requestId,
                code=error.code,
                latencyMs=int((time.monotonic() - started) * 1000),
            )
            raise
        _log(
            "analyze_ok",
            requestId=payload.requestId,
            engine=result.analyzer.engine,
            model=result.analyzer.model,
            latencyMs=result.analyzer.latencyMs,
            items=len(result.plan.items),
        )
        return result

    return app


app = create_app()
