"""Extract the plan object from the Markdown DocuMind generates."""

from __future__ import annotations

import ast
import json
import re
from typing import Any

from .contracts import AnalyzerError

# Any fenced block. The info string (json, JSON, or empty) is not trusted: the body has to
# parse as a JSON object, so other fences DocuMind adds (diagrams, examples) are skipped.
_FENCE = re.compile(r"```[^\n`]*\r?\n(?P<body>.*?)```", re.DOTALL)


def _object_in(body: str) -> dict[str, Any] | None:
    text = body.strip()
    try:
        payload = json.loads(text)
    except json.JSONDecodeError:
        # DocuMind renders `code` with str(): a dict-valued answer arrives as Python repr
        # (single quotes, True/False/None). That is the same plan, so read it instead of failing.
        try:
            payload = ast.literal_eval(text)
        except (ValueError, SyntaxError):
            return None
    return payload if isinstance(payload, dict) else None


def first_code_block(markdown: str) -> str | None:
    """The body of the first fenced block, or None. Used to quote a rejected answer back."""
    match = _FENCE.search(markdown or "")
    return match.group("body").strip() if match else None


def has_plan_object(markdown: str) -> bool:
    """True when at least one fenced block parses as a JSON object.

    A ``False`` here is the one failure worth re-asking for: the model answered in prose. A
    block that starts with ``{`` but is cut off is a different problem, and retrying it just
    spends another call on the same answer.
    """
    for block in _FENCE.finditer(markdown or ""):
        if _object_in(block.group("body")) is not None:
            return True
    return False


def is_truncated_plan(markdown: str) -> bool:
    """True when a fenced block starts an object that never closes.

    The answer ran out of room, so asking again produces the same cut-off plan: no retry.
    """
    block = first_code_block(markdown)
    return bool(block) and block.lstrip().startswith("{") and not block.rstrip().endswith("}")


def extract_plan(markdown: str) -> dict[str, Any]:
    """Return the plan object, or raise ``ANALYZER_INVALID_OUTPUT``.

    DocuMind renders a publication document around the answer: YAML front matter, headings,
    navigation and a closing thematic break. The plan is therefore the one fenced JSON
    *object* in that document, and everything around it is ignored.

    Exactly one such object is accepted. None, two, or one that cannot be read is a failed
    generation: the service never returns a partial or guessed plan.
    """
    if not markdown or not markdown.strip():
        raise AnalyzerError(422, "ANALYZER_INVALID_OUTPUT", "DocuMind returned an empty document.")

    blocks = list(_FENCE.finditer(markdown))
    bodies = [block.group("body").strip() for block in blocks]
    candidates = [plan for body in bodies if (plan := _object_in(body)) is not None]

    if len(candidates) == 1:
        return candidates[0]
    if len(candidates) > 1:
        raise AnalyzerError(
            422,
            "ANALYZER_INVALID_OUTPUT",
            "The generated document contains more than one JSON object.",
        )
    if blocks:
        # A plan that stops before its closing brace was cut off at the output limit
        cut_off = any(body.startswith("{") and not body.endswith("}") for body in bodies)
        if cut_off:
            raise AnalyzerError(
                422,
                "ANALYZER_INVALID_OUTPUT",
                "The JSON block is incomplete; the answer was cut off.",
            )
        raise AnalyzerError(
            422, "ANALYZER_INVALID_OUTPUT", "The JSON block could not be parsed."
        )
    if re.search(r"```[^\n`]*\r?\n\s*\{", markdown):
        raise AnalyzerError(
            422,
            "ANALYZER_INVALID_OUTPUT",
            "The JSON block is not closed; the answer may have been cut off.",
        )
    raise AnalyzerError(
        422,
        "ANALYZER_INVALID_OUTPUT",
        "The generated document must contain one fenced JSON block.",
    )
