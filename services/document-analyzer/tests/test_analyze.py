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
from app.engine import ProviderFailure
from app.main import create_app

TOKEN = "t" * 40
WORKSPACE = {
    "model": "model-1",
    "apiKey": "sk-workspace",
    "baseUrl": "https://example.test/v1",
}


def settings() -> Settings:
    return Settings(
        environment="development",
        token=TOKEN,
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
            "llm": WORKSPACE,
        }
    )


def refusal(reason: str, *, error: str = "StatusError", status: int | None = None, answers: int = 0) -> ProviderFailure:
    """What ``_record_provider_failure`` stores for one refused model call."""
    return ProviderFailure(reason=reason, error=error, status=status, answers=answers)


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


class TestProviderRefusals:
    """A provider that refuses every call must not look like an unreadable plan.

    DocuMind catches a failed model call inside each agent and renders a document without a plan
    block, so without this the request ends as "must contain one fenced JSON block" -- the wrong
    diagnosis for a rate limit, an exhausted free allowance or an empty balance.
    """

    def test_a_rate_limit_or_empty_balance_is_reported_as_quota(self) -> None:
        from app import engine

        class StatusError(Exception):
            def __init__(self, status_code: int) -> None:
                self.status_code = status_code

        assert engine.classify_provider_error(StatusError(429)) == "quota"
        assert engine.classify_provider_error(StatusError(402)) == "quota"
        assert engine.classify_provider_error(StatusError(401)) == "auth"
        assert engine.classify_provider_error(StatusError(404)) == "model"
        assert engine.classify_provider_error(StatusError(400)) == "rejected"
        # A server error is the provider's problem, not the workspace's settings: it is transient
        assert engine.classify_provider_error(StatusError(503)) == "unavailable"
        assert engine.classify_provider_error(StatusError(500)) == "unavailable"
        assert engine.classify_provider_error(StatusError(507)) == "unavailable"
        # A transport class name, not a status: the endpoint could not be dialled
        assert engine.classify_provider_error(type("APIConnectionError", (Exception,), {})()) == "unreachable"
        assert engine.classify_provider_error(ValueError("odd")) == "error"

    def test_a_connection_cut_after_the_provider_accepted_the_call_is_transient(self) -> None:
        from app import engine

        # The provider client reports every transport problem as one connection class and keeps the
        # real one as the cause: only the cause says whether the request was ever sent.
        class APIConnectionError(Exception):
            pass

        class ReadError(Exception):
            pass

        class ConnectError(Exception):
            pass

        def wrapped(cause: Exception) -> APIConnectionError:
            error = APIConnectionError("Connection error.")
            error.__cause__ = cause
            return error

        assert engine.classify_provider_error(wrapped(ReadError())) == "unavailable"
        assert engine.classify_provider_error(wrapped(ConnectError())) == "unreachable"
        assert engine.is_transient_failure(wrapped(ReadError())) is True
        assert engine.is_transient_failure(wrapped(ConnectError())) is True
        # A refused key is deterministic: the same call would be refused again
        assert engine.is_transient_failure(type("AuthError", (Exception,), {"status_code": 401})()) is False

    def test_a_transient_failure_is_retried_once_and_the_answer_is_kept(self) -> None:
        from app import engine

        class InternalServerError(Exception):
            status_code = 503

        class Model:
            def __init__(self) -> None:
                self.calls = 0

            async def ainvoke(self, *_args: object, **_kwargs: object) -> str:
                self.calls += 1
                if self.calls == 1:
                    raise InternalServerError()
                return "answer"

        async def scenario() -> tuple[str, int, object]:
            engine._provider_failures.set([])
            engine._provider_answers.set([0])
            model = Model()
            answer = await engine._RecordingChatModel(model).ainvoke([])
            return answer, model.calls, engine.provider_failure()

        answer, calls, failure = asyncio.run(scenario())
        assert answer == "answer"
        # One retry, and the recovered call is not reported as the reason a plan is missing
        assert calls == 2
        assert failure is None

    def test_a_deterministic_refusal_is_not_retried(self) -> None:
        from app import engine

        class AuthenticationError(Exception):
            status_code = 401

        class Model:
            def __init__(self) -> None:
                self.calls = 0

            async def ainvoke(self, *_args: object, **_kwargs: object) -> str:
                self.calls += 1
                raise AuthenticationError()

        async def scenario() -> int:
            engine._provider_failures.set([])
            engine._provider_answers.set([0])
            model = Model()
            with pytest.raises(AuthenticationError):
                await engine._RecordingChatModel(model).ainvoke([])
            return model.calls

        assert asyncio.run(scenario()) == 1

    def test_a_failure_a_later_call_recovered_from_is_not_the_reason_a_plan_is_missing(self) -> None:
        from app import engine

        async def scenario() -> object:
            engine._provider_failures.set([refusal("unavailable", error="InternalServerError", status=503, answers=0)])
            engine._provider_answers.set([1])
            return engine.provider_failure()

        assert asyncio.run(scenario()) is None

    def test_a_failure_with_no_answer_after_it_is_reported(self) -> None:
        from app import engine

        async def scenario() -> object:
            engine._provider_failures.set([refusal("unavailable", answers=0)])
            engine._provider_answers.set([0])
            return engine.provider_failure()

        assert asyncio.run(scenario()).reason == "unavailable"

    def test_the_recording_model_keeps_the_refusal_and_re_raises(self) -> None:
        from app import engine

        class StatusError(Exception):
            status_code = 429

        class Model:
            model_name = "workspace-model"

            async def ainvoke(self, *_args: object, **_kwargs: object) -> object:
                raise StatusError()

        async def scenario() -> object:
            engine._provider_failures.set([])
            engine._provider_answers.set([0])
            wrapped = engine._RecordingChatModel(Model())
            assert wrapped.model_name == "workspace-model"
            with pytest.raises(StatusError):
                await wrapped.ainvoke([])
            return engine.provider_failure()

        failure = asyncio.run(scenario())
        assert failure.reason == "quota"
        # The exception class is kept for the log; the provider's own sentence never is
        assert failure.error == "StatusError"
        assert failure.status == 429

    def test_a_refused_provider_stops_before_the_repair_run(self, monkeypatch: pytest.MonkeyPatch) -> None:
        from app import engine

        calls: list[int] = []

        async def fake_generate(*_args: object, **_kwargs: object) -> str:
            calls.append(1)
            # What the SDK's child task records when the provider answers 429/402
            engine._provider_failures.set([refusal("quota", status=429)])
            return "---\ntitle: Plan\n---\n\n## Summary\n\nNo plan block at all.\n"

        monkeypatch.setattr("app.analyze.generate_markdown", fake_generate)
        with pytest.raises(AnalyzerError) as caught:
            asyncio.run(analyze(request(), settings()))

        assert caught.value.code == "ANALYZER_PROVIDER_ERROR"
        assert "free allowance" in caught.value.message
        # The provider refused: asking again would spend a run on the same refusal
        assert len(calls) == 1

    def test_a_provider_that_dropped_the_answer_tells_the_person_to_try_again(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        from app import engine

        async def fake_generate(*_args: object, **_kwargs: object) -> str:
            engine._provider_failures.set([refusal("unavailable", error="RemoteProtocolError", status=503)])
            return "---\ntitle: Plan\n---\n\n## Summary\n\nNo plan block at all.\n"

        monkeypatch.setattr("app.analyze.generate_markdown", fake_generate)
        with pytest.raises(AnalyzerError) as caught:
            asyncio.run(analyze(request(), settings()))

        assert caught.value.code == "ANALYZER_PROVIDER_ERROR"
        # Not "check your plan and model": nothing in the workspace's settings is wrong
        assert "temporarily unavailable" in caught.value.message
        assert "Settings" in caught.value.message

    def test_a_retry_refused_after_a_prose_answer_is_still_reported(self, monkeypatch: pytest.MonkeyPatch) -> None:
        from app import engine

        calls: list[int] = []

        async def fake_generate(*_args: object, **_kwargs: object) -> str:
            calls.append(1)
            if len(calls) == 2:
                engine._provider_failures.set([refusal("auth", status=401)])
            return "```json\nstill prose\n```\n"

        monkeypatch.setattr("app.analyze.generate_markdown", fake_generate)
        with pytest.raises(AnalyzerError) as caught:
            asyncio.run(analyze(request(), settings()))

        assert caught.value.code == "ANALYZER_PROVIDER_ERROR"
        assert "API key" in caught.value.message
        assert len(calls) == 2

    def test_a_refusal_elsewhere_does_not_hide_a_plan_that_did_arrive(self, monkeypatch: pytest.MonkeyPatch) -> None:
        from app import engine

        async def fake_generate(*_args: object, **_kwargs: object) -> str:
            # An early agent (intent or design) can fail while the planner still answers
            engine._provider_failures.set([refusal("quota")])
            return markdown(plan())

        monkeypatch.setattr("app.analyze.generate_markdown", fake_generate)
        result = asyncio.run(analyze(request(), settings()))
        assert result.plan.project.key == "SHOP"


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
