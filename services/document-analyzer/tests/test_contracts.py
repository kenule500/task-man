"""The plan contract both sides share: ``packages/contracts``.

``plan.golden.json`` is the one plan both sides must agree on. It is validated here (Python) and in
``services/api/src/__tests__/aiPlanContract.test.ts`` (Node), so a change to one side only fails one
of the two suites instead of drifting silently.

The two plan models look different on purpose: the analyzer *repairs* the model's small deviations
(unknown fields, refs that point nowhere, an off-scale estimate) and Node's ``finalizePlan`` applies
the same repairs, while the published JSON Schema describes the clean shape both sides end up with.
These tests pin that relationship.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from jsonschema import Draft7Validator
from pydantic import ValidationError

from app.contracts import AnalyzeRequest, AnalyzerError, PlanContract
from app.parsing import extract_plan
from app.plan_limits import PLAN_LIMITS

CONTRACTS = Path(__file__).resolve().parents[3] / "packages" / "contracts"
GOLDEN = json.loads((CONTRACTS / "fixtures" / "plan.golden.json").read_text(encoding="utf-8"))
SCHEMA = json.loads((CONTRACTS / "plan.contract.json").read_text(encoding="utf-8"))


def plan(**overrides: object) -> dict:
    content = json.loads(json.dumps(GOLDEN))
    content.update(overrides)
    return content


def item(**overrides: object) -> dict:
    content = json.loads(json.dumps(GOLDEN["items"][0]))
    content.update(overrides)
    return content


def repaired(content: dict) -> dict:
    """The plan as the analyzer now returns it: validated and repaired, then serialized."""
    return PlanContract.model_validate(content).model_dump(mode="json")


def body(**overrides: object) -> dict:
    """A minimal valid request; ``llm`` is added by the tests that need the workspace block."""
    payload: dict = {
        "contractVersion": 1,
        "requestId": "11111111-2222-4333-8444-555555555555",
        "document": {"fileName": "brief.md", "mimeType": "text/markdown", "text": "x"},
        "options": {},
    }
    payload.update(overrides)
    return payload


class TestGoldenFixture:
    def test_the_golden_plan_is_valid_against_the_published_schema(self) -> None:
        Draft7Validator(SCHEMA).validate(GOLDEN)

    def test_the_python_contract_accepts_the_golden_plan_unchanged(self) -> None:
        # Repairing an already clean plan must change nothing
        assert repaired(GOLDEN) == GOLDEN

    def test_the_analyzer_never_returns_something_off_the_schema(self) -> None:
        # Whatever it repairs, the answer stays a valid contract plan for Node and the stored plan
        stem = {
            "ref": "", "sprintIndex": 9, "epicRef": "nope", "storyPoints": 4,
            "labels": ["a", "b"], "acceptanceCriteria": ["ok"], "subtasks": [],
        }
        Draft7Validator(SCHEMA).validate(repaired(plan(
            sprints=[],
            epics=[{"ref": "E1", "title": "One", "description": ""}, {"ref": "E1", "title": "Two", "description": ""}],
            items=[item(**stem), item(**stem), item(**stem)],
        )))


class TestRepair:
    """What used to refuse a paid-for generation, and is now repaired (mirrors ``finalizePlan``)."""

    def test_an_unknown_field_is_dropped(self) -> None:
        messy = plan(confidence=0.9, project={**GOLDEN["project"], "owner": "Ada"})
        messy["items"][0]["estimate"] = {"low": 3}
        result = repaired(messy)
        assert "confidence" not in result
        assert "owner" not in result["project"]
        assert "estimate" not in result["items"][0]

    def test_a_missing_field_gets_its_default(self) -> None:
        bare = {"project": GOLDEN["project"], "items": [{"ref": "T1", "title": "Only a title"}]}
        result = repaired(bare)
        assert result["items"][0] == {
            "ref": "T1", "sprintIndex": None, "epicRef": None, "title": "Only a title", "description": "",
            "type": "task", "priority": "medium", "storyPoints": None, "labels": [],
            "acceptanceCriteria": [], "subtasks": [],
        }
        assert (result["sprints"], result["epics"], result["assumptions"], result["risks"]) == ([], [], [], [])

    @pytest.mark.parametrize(("given", "expected"), [(4, 5), (6, 5), (10, 8), (14, 13), (100, 13), (4.4, 5), (0, None)])
    def test_an_off_scale_estimate_snaps_to_the_fibonacci_scale(self, given: float, expected: int | None) -> None:
        assert repaired(plan(items=[item(storyPoints=given)]))["items"][0]["storyPoints"] == expected

    def test_an_unresolvable_epic_or_sprint_becomes_null(self) -> None:
        result = repaired(plan(items=[item(epicRef="E9"), item(epicRef="E1", sprintIndex=7)]))
        assert [entry["epicRef"] for entry in result["items"]] == [None, "E1"]
        assert [entry["sprintIndex"] for entry in result["items"]] == [0, None]

    def test_duplicate_and_unreadable_refs_are_renumbered(self) -> None:
        result = repaired(plan(
            epics=[{"ref": "E1", "title": "One", "description": ""}, {"ref": "E1", "title": "Two", "description": ""}],
            items=[item(ref="E1"), item(ref=""), item(ref="bad ref!"), item(ref="T1")],
        ))
        refs = [epic["ref"] for epic in result["epics"]] + [entry["ref"] for entry in result["items"]]
        assert len({ref.lower() for ref in refs}) == len(refs)
        # The renumbered item that pointed at the first epic still points at it
        assert result["items"][0]["epicRef"] == "E1"

    def test_an_item_without_a_sprint_stays_in_the_backlog(self) -> None:
        assert repaired(plan(items=[item(sprintIndex=None)]))["items"][0]["sprintIndex"] is None

    def test_the_limits_of_the_whole_plan_hold(self) -> None:
        many = [item(ref=f"T{n}", subtasks=[{"title": "s", "acceptanceCriteria": []}] * 8) for n in range(60)]
        subtasks = sum(len(entry["subtasks"]) for entry in repaired(plan(items=many))["items"])
        assert subtasks == PLAN_LIMITS.subtasks_total
        long_lists = repaired(plan(sprints=GOLDEN["sprints"] * 10, assumptions=["a"] * 40, risks=["r"] * 40))
        assert len(long_lists["sprints"]) == PLAN_LIMITS.sprints
        assert (len(long_lists["assumptions"]), len(long_lists["risks"])) == (PLAN_LIMITS.notes, PLAN_LIMITS.notes)

    def test_a_plan_with_no_usable_item_is_still_refused(self) -> None:
        with pytest.raises(ValidationError):
            PlanContract.model_validate(plan(items=[]))
        with pytest.raises(ValidationError):
            PlanContract.model_validate({})


class TestParsingStillRefuses:
    """Output that cannot be repaired keeps its refusal: it is the reason to try again."""

    @pytest.mark.parametrize(
        ("markdown", "message"),
        [
            ("", "empty document"),
            ("---\ntitle: Plan\n---\n", "must contain one fenced JSON block"),
            ("```json\n{\"project\": \n", "not closed"),
            ("```json\n{\"items\": \n```\n", "incomplete; the answer was cut off"),
            ("```json\n{not json}\n```\n", "could not be parsed"),
        ],
    )
    def test_unreadable_output_is_an_invalid_output(self, markdown: str, message: str) -> None:
        with pytest.raises(AnalyzerError) as caught:
            extract_plan(markdown)
        assert caught.value.code == "ANALYZER_INVALID_OUTPUT"
        assert message in caught.value.message


class TestRequestStaysStrict:
    def test_an_unknown_request_field_is_refused(self) -> None:
        body = {
            "contractVersion": 1,
            "requestId": "11111111-2222-4333-8444-555555555555",
            "document": {"fileName": "brief.md", "mimeType": "text/markdown", "text": "x"},
            "options": {},
            "surprise": True,
        }
        with pytest.raises(ValidationError):
            AnalyzeRequest.model_validate(body)


class TestWorkspaceProviderBlock:
    """The BYOK block the API sends: optional, strict, and HTTPS only."""

    def test_a_request_without_the_block_is_still_valid(self) -> None:
        assert AnalyzeRequest.model_validate(body()).llm is None

    def test_the_workspace_endpoint_key_and_model_are_accepted(self) -> None:
        request = AnalyzeRequest.model_validate(body(llm={
            "model": "qwen-plus", "apiKey": "sk-workspace", "baseUrl": "https://example.test/v1",
        }))
        assert request.llm is not None
        assert request.llm.model == "qwen-plus"
        assert request.llm.baseUrl == "https://example.test/v1"

    @pytest.mark.parametrize(
        "base_url",
        [
            "http://example.test/v1",  # plain HTTP would send the key in the clear
            "ftp://example.test/v1",
            "example.test/v1",
            "https://user:pass@example.test/v1",
        ],
    )
    def test_an_endpoint_that_is_not_plain_https_is_refused(self, base_url: str) -> None:
        with pytest.raises(ValidationError):
            AnalyzeRequest.model_validate(body(llm={
                "model": "qwen-plus", "apiKey": "sk-workspace", "baseUrl": base_url,
            }))

    def test_an_unknown_field_inside_the_block_is_refused(self) -> None:
        with pytest.raises(ValidationError):
            AnalyzeRequest.model_validate(body(llm={
                "model": "qwen-plus", "apiKey": "sk-workspace",
                "baseUrl": "https://example.test/v1", "api_key": "smuggled",
            }))

    @pytest.mark.parametrize("missing", ["model", "apiKey", "baseUrl"])
    def test_every_field_of_the_block_is_required(self, missing: str) -> None:
        block = {
            "model": "qwen-plus", "apiKey": "sk-workspace", "baseUrl": "https://example.test/v1",
        }
        del block[missing]
        with pytest.raises(ValidationError):
            AnalyzeRequest.model_validate(body(llm=block))
