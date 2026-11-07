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
from .contracts import AnalyzeRequest, AnalyzerError, AnalyzeResponse
from .engine import begin_provider_call_count, provider_call_count
from .idempotency import ResponseCache
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


def _rejected_fields(exc: RequestValidationError) -> str:
    """Field paths of a rejected request, in the same ''path.to.field:error_type'' form ``analyze`` logs.

    The body is never logged: a BYOK request carries the workspace's provider key, and these paths
    name the fields without carrying any of their values.
    """
    return "; ".join(
        f"{'.'.join(str(part) for part in error.get('loc', ()))}:{error.get('type', '')}"
        for error in exc.errors()[:5]
    )


def create_app(settings: Settings | None = None) -> FastAPI:
    environment = settings.environment if settings else os.getenv("ANALYZER_ENV", DEVELOPMENT)
    production = environment.lower() != DEVELOPMENT

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        active = settings or load_settings()
        app.state.settings = active
        app.state.limiter = Limiter(active.max_concurrency)
        app.state.responses = ResponseCache()
        logging.basicConfig(level=logging.INFO)
        _log(
            "startup",
            environment=active.environment,
            provider="workspace",
            maxChars=active.max_chars,
            maxConcurrency=active.max_concurrency,
            timeoutSeconds=active.timeout_seconds,
            maxProviderCalls=active.max_provider_calls,
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
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        # Field paths only (never the body): a rejection here means the API and this contract have
        # drifted, and without this line the 422 leaves no trace of which field disagreed.
        _log("request_rejected", fields=_rejected_fields(exc))
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
        cache: ResponseCache | None = getattr(request.app.state, "responses", None)
        cached = cache.get(payload.requestId) if cache is not None else None
        if cached is not None:
            # The same request id already produced an answer: never run DocuMind twice for it
            _log("analyze_cached", requestId=payload.requestId)
            return cached

        started = time.monotonic()
        # The holder lives in this task; the SDK's child tasks share it, so their calls are
        # counted, and the budget stops a request that would keep calling the provider.
        begin_provider_call_count(active.max_provider_calls)
        try:
            async with limiter.slot():
                result = await with_timeout(analyze(payload, active), active.timeout_seconds)
        except AnalyzerError as error:
            # The request id is returned with every refusal, so the client can send the same one
            # again and be answered from the cache if the answer did exist after all.
            _log(
                "analyze_failed",
                requestId=payload.requestId,
                code=error.code,
                providerCalls=provider_call_count(),
                latencyMs=int((time.monotonic() - started) * 1000),
            )
            raise
        if cache is not None:
            cache.put(payload.requestId, result)
        _log(
            "analyze_ok",
            requestId=payload.requestId,
            engine=result.analyzer.engine,
            model=result.analyzer.model,
            providerCalls=provider_call_count(),
            latencyMs=result.analyzer.latencyMs,
            items=len(result.plan.items),
        )
        return result

    return app


app = create_app()
