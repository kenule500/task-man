"""Run exactly one DocuMind generation and turn it into a validated plan."""

from __future__ import annotations

import json
import logging
import os
import shutil
import tempfile
import time
from pathlib import Path

from pydantic import ValidationError

from .brief import build_query
from .config import SDK_VERSION, Settings
from .contracts import (
    AnalyzeRequest,
    AnalyzerError,
    AnalyzeResponse,
    AnalyzerInfo,
    PlanContract,
)
from .engine import generate_markdown
from .parsing import extract_plan


async def analyze(request: AnalyzeRequest, settings: Settings) -> AnalyzeResponse:
    if len(request.document.text) > settings.max_chars:
        raise AnalyzerError(
            422,
            "ANALYZER_INVALID_REQUEST",
            f"The document text is longer than {settings.max_chars} characters.",
        )

    started = time.monotonic()
    workdir = Path(tempfile.mkdtemp(prefix="documind-"))
    try:
        try:
            os.chmod(workdir, 0o700)
        except OSError:  # Windows development; the directory is still request-private
            pass

        markdown = await generate_markdown(
            settings,
            build_query(request),
            request.options.language.value,
            workdir,
        )
        payload = extract_plan(markdown)
        try:
            # Repairs unknown fields, dangling references and off-scale estimates instead of
            # refusing them; only a plan with nothing usable in it fails here.
            plan = PlanContract.model_validate(payload)
        except ValidationError as error:
            # Field paths only: no document text, no plan content (NFR-022)
            fields = "; ".join(
                f"{'.'.join(str(part) for part in issue['loc'])}:{issue['type']}"
                for issue in error.errors()[:5]
            )
            logging.getLogger("document_analyzer").warning(
                json.dumps({"event": "plan_invalid", "fields": fields}, separators=(",", ":"))
            )
            raise AnalyzerError(
                422,
                "ANALYZER_INVALID_OUTPUT",
                "The generated plan has no usable work items.",
            ) from error

        latency_ms = int((time.monotonic() - started) * 1000)
        return AnalyzeResponse(
            requestId=request.requestId,
            plan=plan,
            analyzer=AnalyzerInfo(
                sdkVersion=SDK_VERSION,
                model=settings.model,
                latencyMs=latency_ms,
            ),
        )
    finally:
        shutil.rmtree(workdir, ignore_errors=True)
