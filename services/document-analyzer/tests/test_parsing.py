"""Parsing the plan DocuMind generates into the shared contract."""

from __future__ import annotations

import json

import pytest

from app.contracts import AnalyzerError
from app.parsing import extract_plan


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

