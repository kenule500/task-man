"""Run one DocuMind generation and turn it into a validated plan.

Normally that is exactly one generation. A second is spent only when the first answer wrote prose
where the plan JSON belongs, which has no recoverable content to repair.
"""

from __future__ import annotations

import json
import logging
import os
import shutil
import tempfile
import time
from pathlib import Path

from pydantic import ValidationError

from .brief import build_query, repair_query
from .config import SDK_VERSION, Settings
from .contracts import (
    AnalyzeRequest,
    AnalyzerError,
    AnalyzeResponse,
    AnalyzerInfo,
    PlanContract,
)
from .engine import ProviderFailure, generate_markdown, provider_failure
from .parsing import extract_plan, has_plan_object, is_truncated_plan

# How a refused provider call is described to the person who asked. The provider's own sentence is
# never echoed (it can carry the account id or request id), and each class has a different fix.
_PROVIDER_MESSAGES = {
    "quota": (
        "The workspace AI provider refused the plan generation: the model's free allowance may be "
        "used up, the account may have no balance, or the provider is rate limiting requests. "
        "Check the provider plan in Settings > Workspace > AI, then try again."
    ),
    "auth": (
        "The workspace AI provider rejected its API key. An owner or admin can update it in "
        "Settings > Workspace > AI, then try again."
    ),
    "model": (
        "The workspace AI provider does not recognise the configured model. An owner or admin can "
        "choose another model in Settings > Workspace > AI."
    ),
    "rejected": (
        "The workspace AI provider rejected the request. Try another model in "
        "Settings > Workspace > AI."
    ),
    "unreachable": (
        "The workspace AI provider could not be reached. Check the provider endpoint in "
        "Settings > Workspace > AI, then try again."
    ),
    # The provider accepted the request and then failed to answer it: a server error, or a
    # connection dropped mid-answer. Nothing about the workspace's settings is wrong, and the same
    # request may simply work on the next attempt (the model call itself is retried once).
    "unavailable": (
        "The workspace AI provider is temporarily unavailable: it returned a server error or the "
        "connection was dropped before it finished the plan. This is usually brief. Try again in a "
        "minute; if it keeps happening, try another model in Settings > Workspace > AI."
    ),
    "error": (
        "The workspace AI provider failed before the plan could be generated. Check the provider "
        "settings for this workspace, then try again."
    ),
}


def _provider_refusal(reason: str) -> AnalyzerError:
    return AnalyzerError(
        422,
        "ANALYZER_PROVIDER_ERROR",
        _PROVIDER_MESSAGES.get(reason, _PROVIDER_MESSAGES["error"]),
    )


def _log_refusal(refusal: ProviderFailure, stage: str) -> None:
    """The refusal with what the person cannot be told, for whoever reads the service log.

    The label alone ("error") named nothing: an unclassified failure, a 503 and a connection dropped
    mid-answer all ended as the same sentence, so a real refusal could not be diagnosed from a log.
    The exception class and the HTTP status say which of those happened, and neither can carry an
    account id or any of the document -- the provider's own message is still never logged.
    """
    logging.getLogger("document_analyzer").warning(
        json.dumps(
            {
                "event": "plan_provider_refused",
                "reason": refusal.reason,
                "error": refusal.error,
                "status": refusal.status,
                "stage": stage,
            },
            separators=(",", ":"),
        )
    )


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

        # ``llm`` is the workspace BYOK block the API sends with the request, so the pipeline runs
        # on that workspace's endpoint, model and key rather than on this deployment's settings.
        markdown = await generate_markdown(
            settings,
            build_query(request),
            request.options.language.value,
            workdir,
            workspace=request.llm,
        )

        def without_plan(text: str) -> bool:
            return not has_plan_object(text) and not is_truncated_plan(text)

        if without_plan(markdown):
            # A provider that refuses every call (rate limit, no balance, bad key, unreachable)
            # makes DocuMind fall back to a document with no plan block. That is not prose worth
            # re-asking for: the same refusal would come back and spend another run.
            refused = provider_failure()
            if refused:
                _log_refusal(refused, "first")
                raise _provider_refusal(refused.reason)

            # The one failure with nothing to repair: the model answered in prose instead of
            # JSON. Quote that answer back and ask once more. A cut-off object is not retried;
            # it would be cut off again.
            logging.getLogger("document_analyzer").warning(
                json.dumps({"event": "plan_retry", "reason": "no_json_object"}, separators=(",", ":"))
            )
            markdown = await generate_markdown(
                settings,
                repair_query(request, markdown),
                request.options.language.value,
                workdir,
                workspace=request.llm,
            )
            # The repair run can be refused too, after an answer that was merely prose.
            refused = provider_failure() if without_plan(markdown) else None
            if refused:
                _log_refusal(refused, "retry")
                raise _provider_refusal(refused.reason)

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
                # The model the plan ran on: the workspace's, which is the only one there is
                model=request.llm.model,
                latencyMs=latency_ms,
            ),
        )
    finally:
        shutil.rmtree(workdir, ignore_errors=True)
