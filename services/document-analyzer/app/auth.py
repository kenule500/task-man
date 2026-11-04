"""Service-to-service bearer authentication."""

from __future__ import annotations

import hmac

from .config import Settings
from .contracts import AnalyzerError


def authorize(header: str | None, settings: Settings) -> None:
    if not settings.token:
        raise AnalyzerError(
            503,
            "ANALYZER_NOT_CONFIGURED",
            "The analyzer token is not configured. An operator must set DOCUMENT_ANALYZER_TOKEN.",
        )
    expected = f"Bearer {settings.token}"
    if not header or not hmac.compare_digest(header, expected):
        raise AnalyzerError(401, "ANALYZER_UNAUTHORIZED", "The analyzer token is missing or wrong.")
