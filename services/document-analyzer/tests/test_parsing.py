"""Parsing the plan DocuMind generates into the shared contract."""

from __future__ import annotations

import json

import pytest

from app.brief import PLAN_SENTINEL
from app.contracts import AnalyzerError
from app.parsing import extract_plan, has_plan_object, is_truncated_plan, plan_body


def plan() -> dict:
    return {
        "project": {"name": "Shop", "key": "SHOP", "description": "", "color": "blue"},
        "sprints": [],
        "epics": [],
        "items": [
            {
                "ref": "T1",
                "sprintIndex": None,
                "epicRef": None,
                "title": "Buy a cart",
                "description": "",
                "type": "story",
                "priority": "medium",
                "storyPoints": 3,
                "labels": [],
                "acceptanceCriteria": [],
                "subtasks": [],
            }
        ],
        "assumptions": [],
        "risks": [],
    }


def document(plan_json: str, *, before: str = "", after: str = "") -> str:
    """The shape MarkdownRenderer always produces: front matter, headings, blocks, closing rule."""
    return (
        '---\ntitle: "Project plan"\nstatus: designed-draft\n---\n\n'
        "# Project plan\n\n### Structured brief\n\n"
        "## Executive Summary\n\n> **At a glance**  \n> A plan.\n\n"
        "## Contents\n\n1. [Plan](#plan)\n\n"
        "## Plan\n\n"
        f"{before}```json\n{plan_json}\n```\n{after}"
        "---\n"
    )


class TestExtractPlan:
    def test_reads_the_block_wrapped_in_the_generated_document(self) -> None:
        assert extract_plan(document(json.dumps(plan()))) == plan()

    def test_ignores_other_fences_and_surrounding_text(self) -> None:
        text = document(
            json.dumps(plan()),
            before="```mermaid\ngraph TD; A-->B;\n```\n\n",
            after="\n\n## References\n\n- source\n\n",
        )
        assert extract_plan(text)["project"]["key"] == "SHOP"

    def test_accepts_an_unlabelled_fence(self) -> None:
        assert extract_plan("```\n" + json.dumps(plan()) + "\n```\n")["items"][0]["ref"] == "T1"

    def test_accepts_the_python_literal_the_renderer_can_produce(self) -> None:
        # A dict-valued "code" is rendered with str(): single quotes and True/False/None
        literal = (
            "{'project': {'name': 'Shop', 'key': 'SHOP', 'description': '', 'color': 'blue'}, "
            "'sprints': [], 'epics': [], 'items': [], 'assumptions': [], 'risks': []}"
        )
        assert extract_plan("```json\n" + literal + "\n```\n")["project"]["name"] == "Shop"

    @pytest.mark.parametrize(
        ("markdown", "message"),
        [
            ("", "empty document"),
            ("---\ntitle: Nothing\n---\n", "must contain one fenced JSON block"),
            ("```json\n[]\n```\n", "could not be parsed"),
            ("```json\n{not json}\n```\n", "could not be parsed"),
            ("```json\n{\"project\": \n", "not closed"),
            ("```json\n{\"project\": {\"name\": \"X\"\n```\n", "incomplete; the answer was cut off"),
            (
                document(json.dumps(plan())) + "\n```json\n" + json.dumps(plan()) + "\n```\n",
                "more than one JSON object",
            ),
        ],
    )
    def test_refuses_anything_but_one_readable_object(self, markdown: str, message: str) -> None:
        with pytest.raises(AnalyzerError) as caught:
            extract_plan(markdown)
        assert caught.value.code == "ANALYZER_INVALID_OUTPUT"
        assert caught.value.status == 422
        assert message in caught.value.message


class TestSentinel:
    """The brief opens "code" with a sentinel line.

    DocuMind's spec normaliser reads a ``code`` value that starts with "{" as a Python literal
    and flattens the plan into prose, so the value has to start with something else; the sentinel
    is dropped here, before anything looks for a JSON object.
    """

    def test_reads_a_block_that_opens_with_the_sentinel(self) -> None:
        assert extract_plan(document(f"{PLAN_SENTINEL}\n{json.dumps(plan())}")) == plan()

    def test_reads_the_sentinel_glued_to_the_object(self) -> None:
        assert extract_plan(document(f"{PLAN_SENTINEL} {json.dumps(plan())}"))["items"][0]["ref"] == "T1"

    def test_the_sentinel_line_alone_is_not_a_plan(self) -> None:
        with pytest.raises(AnalyzerError) as caught:
            extract_plan(document(PLAN_SENTINEL))
        assert "could not be parsed" in caught.value.message

    def test_has_plan_object_sees_through_the_sentinel(self) -> None:
        assert has_plan_object(document(f"{PLAN_SENTINEL}\n{json.dumps(plan())}")) is True
        assert has_plan_object(document(f"{PLAN_SENTINEL}\nSprint 1 covers onboarding.")) is False

    def test_a_cut_off_plan_behind_the_sentinel_is_still_detected(self) -> None:
        assert is_truncated_plan(document(f'{PLAN_SENTINEL}\n{{"project": {{"name": "Half')) is True

    def test_plan_body_leaves_an_unsentinelled_body_alone(self) -> None:
        assert plan_body('{"project": {}}') == '{"project": {}}'


class TestFlattenedPlan:
    """A plan the normaliser flattened is not a truncation, so it has to be retried.

    ``analyze`` re-asks once when ``has_plan_object`` is False and ``is_truncated_plan`` is False.
    The flattened form is balanced but is not an object, so it must land in that gap: reading it
    as a truncation skipped the retry and gave up on an answer that one more call could fix.
    """

    def flattened(self) -> str:
        # What _text_value produces: the object's values joined by spaces, not an object
        return " ".join(str(value) for value in plan().values())

    def test_flattened_prose_is_balanced_and_not_a_plan(self) -> None:
        body = plan_body(f"{PLAN_SENTINEL}\n{self.flattened()}")
        assert body.startswith("{")
        assert not body.endswith("}")
        # Balanced braces: the object was not cut off, it was rewritten
        assert has_plan_object(document(f"{PLAN_SENTINEL}\n{self.flattened()}")) is False
        assert is_truncated_plan(document(f"{PLAN_SENTINEL}\n{self.flattened()}")) is False

    def test_flattened_prose_is_reported_as_a_parse_failure(self) -> None:
        with pytest.raises(AnalyzerError) as caught:
            extract_plan(document(f"{PLAN_SENTINEL}\n{self.flattened()}"))
        assert "could not be parsed" in caught.value.message

    def test_a_real_cut_off_object_is_still_a_truncation(self) -> None:
        # The distinction only matters if the genuine truncation still suppresses the retry
        raw = json.dumps(plan())
        assert is_truncated_plan(document(f"{PLAN_SENTINEL}\n{raw[: len(raw) // 2]}")) is True

    def test_a_brace_inside_a_string_does_not_look_like_an_open_object(self) -> None:
        # Counting braces naively would unbalance this and refuse to retry a complete answer
        text = f'{PLAN_SENTINEL}\n{{"description": "costs {{total}} per user"}}'
        assert is_truncated_plan(document(text)) is False

