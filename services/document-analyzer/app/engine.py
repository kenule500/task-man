"""DocuMind engine adapter.

The SDK is imported lazily so the service can start, lint and serve ``/healthz`` in an
environment where the (large) DocuMind dependency tree is not installed. The SDK is used for
what it actually does: generating a Markdown document from a query.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from .config import Settings
from .contracts import AnalyzerError


def _documind_class() -> Any:
    try:
        from documind import DocuMind
    except Exception as error:  # pragma: no cover - depends on the deployment image
        raise AnalyzerError(
            503,
            "ANALYZER_NOT_CONFIGURED",
            "The DocuMind SDK is not available in this service.",
        ) from error
    return DocuMind


def create_engine(settings: Settings, storage_path: Path) -> Any:
    """One engine per request, so generated files land in this request's private directory."""
    engine_class = _documind_class()
    return engine_class(**settings.engine_kwargs(), storage_local_path=str(storage_path))


async def generate_markdown(
    settings: Settings, query: str, locale: str, storage_path: Path
) -> str:
    engine = create_engine(settings, storage_path)
    try:
        result = await engine.generate(
            query=query,
            format="md",
            locale=locale,
            needs_research=False,
        )
    except AnalyzerError:
        raise
    except Exception as error:  # pragma: no cover - the SDK raises provider-specific errors
        raise AnalyzerError(
            502,
            "ANALYZER_UNAVAILABLE",
            "DocuMind could not generate the plan. Try again.",
        ) from error

    errors = getattr(result, "errors", None) or []
    output_path = getattr(result, "output_path", None)
    if errors or not output_path:
        raise AnalyzerError(
            502, "ANALYZER_UNAVAILABLE", "DocuMind did not produce a document."
        )

    path = Path(output_path)
    try:
        return path.read_text(encoding="utf-8")
    except OSError as error:
        raise AnalyzerError(
            502, "ANALYZER_UNAVAILABLE", "The generated document could not be read."
        ) from error
