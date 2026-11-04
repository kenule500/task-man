"""One SDK invocation per request, and a repeated request id never generates twice."""

from __future__ import annotations

import asyncio
import json

import pytest
from fastapi.testclient import TestClient

from app.analyze import analyze
from app.brief import PLAN_SENTINEL
from app.config import Settings
from app.contracts import AnalyzeRequest, AnalyzerError, AnalyzeResponse, AnalyzerInfo, PlanContract
from app.main import create_app

TOKEN = "t" * 40


def settings() -> Settings:
    return Settings(
        environment="development",
        token=TOKEN,
        provider="custom",
        model="model-1",
        api_key="key",
        base_url="http://example.invalid",
        max_chars=24_000,
        max_bytes=2_000_000,
        max_concurrency=2,
        timeout_seconds=30,
        port=8000,
    )


def plan() -> dict:
    return {
        "project": {"name": "Shop", "key": "SHOP", "description": "", "color": "blue"},
        "sprints": [],
        "epics": [],
        "items": [
            {
                "ref": "T1", "sprintIndex": None, "epicRef": None, "title": "Buy a cart", "description": "",
                "type": "story", "priority": "medium", "storyPoints": 3, "labels": [],
                "acceptanceCriteria": [], "subtasks": [],
            }
        ],
        "assumptions": [],
        "risks": [],
    }


def markdown(payload: dict) -> str:
    """The shape DocuMind's renderer produces: front matter, headings, a fenced block, a closing rule."""
    head = '---\ntitle: "Plan"\n---\n\n## Summary\n\nText.\n\n## Plan JSON\n\n```json\n'
    return head + json.dumps(payload) + "\n```\n\n---\n"


def request(text: str = "Students book clinic appointments.") -> AnalyzeRequest:
    return AnalyzeRequest.model_validate(
        {
            "contractVersion": 1,
            "requestId": "11111111-2222-4333-8444-555555555555",
            "document": {"fileName": "brief.md", "mimeType": "text/markdown", "text": text},
            "options": {
                "projectName": "", "projectKey": "", "sprintLengthWeeks": 2, "startDate": "2026-11-02",
                "teamSize": 3, "extraInstructions": "", "language": "en", "existingProject": False,
            },
        }
    )


class TestOneInvocation:
    def test_generates_once_and_returns_the_plan(self, monkeypatch: pytest.MonkeyPatch) -> None:
        calls: list[int] = []

        async def fake_generate(*_args: object, **_kwargs: object) -> str:
            calls.append(1)
            return markdown(plan())

        monkeypatch.setattr("app.analyze.generate_markdown", fake_generate)
        result = asyncio.run(analyze(request(), settings()))
        assert len(calls) == 1
        assert result.plan.project.key == "SHOP"
        assert len(result.plan.items) == 1

    def test_accepts_a_plan_behind_the_sentinel_without_a_retry(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        calls: list[int] = []

        async def fake_generate(*_args: object, **_kwargs: object) -> str:
            calls.append(1)
            head = '---\ntitle: "Plan"\n---\n\n## Summary\n\nText.\n\n## Plan JSON\n\n```json\n'
            return head + f"{PLAN_SENTINEL}\n{json.dumps(plan())}\n```\n\n---\n"

        monkeypatch.setattr("app.analyze.generate_markdown", fake_generate)
        result = asyncio.run(analyze(request(), settings()))
        # The normal shape of a good answer: one generation, no repair
        assert len(calls) == 1
        assert result.plan.project.key == "SHOP"

    def test_retries_once_when_the_answer_holds_prose_instead_of_json(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        calls: list[str] = []

        async def fake_generate(*args: object, **_kwargs: object) -> str:
            calls.append(str(args[1]) if len(args) > 1 else "")
            if len(calls) == 1:
                return "```json\nA clinic platform. Sprint 1 — foundation.\n```\n"
            return markdown(plan())

        monkeypatch.setattr("app.analyze.generate_markdown", fake_generate)
        result = asyncio.run(analyze(request(), settings()))
        # Two generations, then the plan: the prose answer is quoted back to the model
        assert len(calls) == 2
        assert "A clinic platform" in calls[1]
        assert result.plan.project.key == "SHOP"

    def test_gives_up_after_one_retry(self, monkeypatch: pytest.MonkeyPatch) -> None:
        calls: list[int] = []

        async def fake_generate(*_args: object, **_kwargs: object) -> str:
            calls.append(1)
            return "```json\nstill prose\n```\n"

        monkeypatch.setattr("app.analyze.generate_markdown", fake_generate)
        with pytest.raises(AnalyzerError) as caught:
            asyncio.run(analyze(request(), settings()))
        assert caught.value.code == "ANALYZER_INVALID_OUTPUT"
        # Never a third call: the retry is a single correction, not a loop
        assert len(calls) == 2

    def test_retries_when_the_normaliser_flattened_the_plan_into_prose(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """The flattened form is balanced but is not an object, so it must still be retried.

        Reading it as a truncation skipped the retry: the braces were balanced, so there was
        nothing to be cut off, yet ``is_truncated_plan`` said otherwise and the one correction
        that could have fixed the answer never ran.
        """
        calls: list[int] = []
        flattened = " ".join(str(value) for value in plan().values())

        async def fake_generate(*_args: object, **_kwargs: object) -> str:
            calls.append(1)
            if len(calls) == 1:
                head = '---\ntitle: "Plan"\n---\n\n## Plan JSON\n\n```json\n'
                return head + f"{PLAN_SENTINEL}\n{flattened}\n```\n\n---\n"
            head = '---\ntitle: "Plan"\n---\n\n## Plan JSON\n\n```json\n'
            return head + f"{PLAN_SENTINEL}\n{json.dumps(plan())}\n```\n\n---\n"

        monkeypatch.setattr("app.analyze.generate_markdown", fake_generate)
        result = asyncio.run(analyze(request(), settings()))
        assert len(calls) == 2
        assert result.plan.project.key == "SHOP"

    def test_does_not_retry_a_cut_off_plan(self, monkeypatch: pytest.MonkeyPatch) -> None:
        calls: list[int] = []

        async def fake_generate(*_args: object, **_kwargs: object) -> str:
            calls.append(1)
            return '```json\n{"project": {"name": "Half\n```'

        monkeypatch.setattr("app.analyze.generate_markdown", fake_generate)
        with pytest.raises(AnalyzerError):
            asyncio.run(analyze(request(), settings()))
        # A truncated object would come back truncated again, so no call is spent on it
        assert len(calls) == 1


class TestProviderCallCount:
    def test_child_tasks_share_the_counter_started_by_the_handler(self) -> None:
        from app import engine

        async def scenario() -> int:
            engine._provider_calls.set([0])  # same holder the handler creates

            async def child() -> None:
                engine._increment_provider_calls()
                engine._increment_provider_calls()

            await asyncio.create_task(child())
            return engine.provider_call_count()

        assert asyncio.run(scenario()) == 2


class TestIdempotency:
    def test_the_same_request_id_is_answered_without_generating_again(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        calls: list[str] = []

        async def fake_analyze(payload: AnalyzeRequest, _settings: Settings) -> AnalyzeResponse:
            calls.append(payload.requestId)
            return AnalyzeResponse(
                requestId=payload.requestId,
                plan=PlanContract.model_validate(plan()),
                analyzer=AnalyzerInfo(sdkVersion="0.2.2", model="model-1", latencyMs=1),
            )

        monkeypatch.setattr("app.main.analyze", fake_analyze)
        headers = {"Authorization": f"Bearer {TOKEN}"}
        body = request().model_dump(mode="json")

        with TestClient(create_app(settings())) as client:
            first = client.post("/v1/plans:analyze", json=body, headers=headers)
            second = client.post("/v1/plans:analyze", json=body, headers=headers)

        assert first.status_code == 200
        assert second.status_code == 200
        assert calls == [body["requestId"]]
        assert first.json() == second.json()

    def test_a_failed_request_is_not_cached(self, monkeypatch: pytest.MonkeyPatch) -> None:
        calls: list[str] = []

        async def fake_analyze(payload: AnalyzeRequest, _settings: Settings) -> AnalyzeResponse:
            calls.append(payload.requestId)
            if len(calls) == 1:
                raise AnalyzerError(422, "ANALYZER_INVALID_OUTPUT", "No plan.")
            return AnalyzeResponse(
                requestId=payload.requestId,
                plan=PlanContract.model_validate(plan()),
                analyzer=AnalyzerInfo(sdkVersion="0.2.2", model="model-1", latencyMs=1),
            )

        monkeypatch.setattr("app.main.analyze", fake_analyze)
        headers = {"Authorization": f"Bearer {TOKEN}"}
        body = request().model_dump(mode="json")

        with TestClient(create_app(settings())) as client:
            first = client.post("/v1/plans:analyze", json=body, headers=headers)
            second = client.post("/v1/plans:analyze", json=body, headers=headers)

        assert first.status_code == 422
        assert second.status_code == 200
        assert len(calls) == 2
