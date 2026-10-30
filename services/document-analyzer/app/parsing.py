"""Extract exactly one fenced JSON block from the generated Markdown."""

from __future__ import annotations

import json
import re
from typing import Any

from .contracts import AnalyzerError

_FENCE = re.compile(r"```(?:json)?\s*(\{.*?\})\s*```", re.DOTALL | re.IGNORECASE)


def extract_plan(markdown: str) -> dict[str, Any]:
    """Return the plan object, or raise ``ANALYZER_INVALID_OUTPUT``.

    The contract is deliberately strict: one block, a JSON object, and nothing after the
    closing fence. Text before the block is ignored so the generator may add a title.
    """
    if not markdown or not markdown.strip():
        raise AnalyzerError(422, "ANALYZER_INVALID_OUTPUT", "DocuMind returned an empty document.")

    matches = list(_FENCE.finditer(markdown))
    if len(matches) != 1:
        raise AnalyzerError(
            422,
            "ANALYZER_INVALID_OUTPUT",
            "The generated document must contain exactly one fenced JSON block.",
        )

    match = matches[0]
    if markdown[match.end() :].strip():
        raise AnalyzerError(
            422,
            "ANALYZER_INVALID_OUTPUT",
            "The generated document contains text after the JSON block.",
        )

    try:
        payload = json.loads(match.group(1))
    except json.JSONDecodeError as error:
        raise AnalyzerError(
            422, "ANALYZER_INVALID_OUTPUT", "The JSON block could not be parsed."
        ) from error

    if not isinstance(payload, dict):
        raise AnalyzerError(422, "ANALYZER_INVALID_OUTPUT", "The JSON block is not an object.")
    return payload
