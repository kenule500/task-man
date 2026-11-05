"""Acceptance tests for upload-document v2.

Each test name carries the acceptance criterion it proves, so `sdrive test` can record the
evidence. The service is exercised through its real FastAPI surface and its real Pydantic
contract; only the DocuMind SDK is replaced, because it would call a provider.
"""

from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import replace
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from jsonschema import Draft202012Validator
from jsonschema.exceptions import ValidationError as JsonSchemaValidationError
from pydantic import ValidationError as PydanticValidationError

from app.analyze import analyze
from app.config import ConfigurationError, Settings, load_settings
from app.contracts import AnalyzeRequest, AnalyzerError, PlanContract
from app.limits import Limiter
from app.main import create_app

TOKEN = "t" * 40
PROVIDER_KEY = "sk-test-provider-key"
REPO_ROOT = Path(__file__).resolve().parents[3]
SERVICE_ROOT = Path(__file__).resolve().parents[1]

DOCUMENT_TEXT = "Students book clinic appointments at the campus health centre."
FILE_NAME = "clinic-brief.md"


def settings(**overrides: object) -> Settings:
    base = Settings(
        environment="development",
        token=TOKEN,
        provider="custom",
        model="model-1",
        api_key=PROVIDER_KEY,
        base_url="http://example.invalid",
        max_chars=24_000,
        max_bytes=2_000_000,
        max_concurrency=2,
        timeout_seconds=30,
        port=8000,
    )
    return replace(base, **overrides)


def plan() -> dict:
    return {
        "project": {"name": "Clinic", "key": "CLINIC", "description": "", "color": "blue"},
        "sprints": [],
        "epics": [],
        "items": [
            {
                "ref": "T1",
                "sprintIndex": None,
                "epicRef": None,
                "title": "Book an appointment",
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


def markdown(payload: dict) -> str:
    head = '---\ntitle: "Plan"\n---\n\n## Summary\n\nText.\n\n## Plan JSON\n\n```json\n'
    return head + json.dumps(payload) + "\n```\n\n---\n"


def body(**overrides: object) -> dict:
    document = {"fileName": FILE_NAME, "mimeType": "text/markdown", "text": DOCUMENT_TEXT}
    options = {
        "projectName": "",
        "projectKey": "",
        "sprintLengthWeeks": 2,
        "startDate": "2026-11-02",
        "teamSize": 3,
        "extraInstructions": "",
        "language": "en",
        "existingProject": False,
    }
    payload: dict = {
        "contractVersion": 1,
        "requestId": "11111111-2222-4333-8444-555555555555",
        "document": document,
        "options": options,
    }
    payload.update(overrides)
    return payload


HEADERS = {"Authorization": f"Bearer {TOKEN}"}


# ---------------------------------------------------------------- AC-047


def test_ac_047_one_generation_produces_one_ready_plan(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[int] = []

    async def fake_generate(*_args: object, **_kwargs: object) -> str:
        calls.append(1)
        return markdown(plan())

    monkeypatch.setattr("app.analyze.generate_markdown", fake_generate)

    result = asyncio.run(analyze(AnalyzeRequest.model_validate(body()), settings()))

    # Exactly one SDK invocation for one request, and the answer is already a usable plan
    assert len(calls) == 1
    assert result.analyzer.engine == "documind"
    assert result.plan.project.key == "CLINIC"
    assert len(result.plan.items) == 1


# ---------------------------------------------------------------- AC-048


def test_ac_048_the_request_carries_the_text_the_options_the_contract_version_and_an_id() -> None:
    request = AnalyzeRequest.model_validate(body())

    assert request.contractVersion == 1
    assert request.requestId == "11111111-2222-4333-8444-555555555555"
    assert request.document.text == DOCUMENT_TEXT
    assert request.document.fileName == FILE_NAME
    assert request.options.language.value == "en"
    assert request.options.sprintLengthWeeks == 2
    assert request.options.startDate == "2026-11-02"
    assert request.options.teamSize == 3


def test_ac_048_the_response_reports_the_engine_and_the_model_that_produced_it(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_generate(*_args: object, **_kwargs: object) -> str:
        return markdown(plan())

    monkeypatch.setattr("app.analyze.generate_markdown", fake_generate)

    result = asyncio.run(analyze(AnalyzeRequest.model_validate(body()), settings(model="model-7")))

    # Node stores these two values on the plan (analyzer=documind, model=<this string>)
    assert result.analyzer.model == "model-7"
    assert result.analyzer.engine == "documind"


# ---------------------------------------------------------------- AC-052


def test_ac_052_healthz_answers_without_authentication_and_without_a_secret() -> None:
    with TestClient(create_app(settings())) as client:
        response = client.get("/healthz")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "sdkVersion": "0.2.2"}
    assert TOKEN not in response.text
    assert PROVIDER_KEY not in response.text


def test_ac_052_production_refuses_to_start_without_a_long_token_and_a_provider_key() -> None:
    environment = {
        "ANALYZER_ENV": "production",
        "DOCUMENT_ANALYZER_TOKEN": "short-token",
        "DOCUMIND_LLM_API_KEY": PROVIDER_KEY,
    }
    with pytest.raises(ConfigurationError, match="at least 32 bytes"):
        load_settings(environment)

    with pytest.raises(ConfigurationError, match="DOCUMIND_LLM_API_KEY"):
        load_settings({"ANALYZER_ENV": "production", "DOCUMENT_ANALYZER_TOKEN": TOKEN})


def test_ac_052_no_endpoint_echoes_the_provider_key(monkeypatch: pytest.MonkeyPatch) -> None:
    async def failing(*_args: object, **_kwargs: object) -> str:
        raise AnalyzerError(502, "ANALYZER_UNAVAILABLE", "DocuMind could not generate the plan.")

    monkeypatch.setattr("app.analyze.generate_markdown", failing)

    with TestClient(create_app(settings())) as client:
        response = client.post("/v1/plans:analyze", json=body(), headers=HEADERS)

    assert response.status_code == 502
    assert PROVIDER_KEY not in response.text
    assert TOKEN not in response.text


# ---------------------------------------------------------------- AC-053


def test_ac_053_a_missing_or_wrong_token_is_refused_before_any_work(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def must_not_run(*_args: object, **_kwargs: object) -> str:
        raise AssertionError("the SDK was called for an unauthenticated request")

    monkeypatch.setattr("app.analyze.generate_markdown", must_not_run)

    with TestClient(create_app(settings())) as client:
        missing = client.post("/v1/plans:analyze", json=body())
        wrong = client.post("/v1/plans:analyze", json=body(), headers={"Authorization": "Bearer nope"})

    assert missing.status_code == 401
    assert missing.json()["code"] == "ANALYZER_UNAUTHORIZED"
    assert wrong.status_code == 401
    assert wrong.json()["code"] == "ANALYZER_UNAUTHORIZED"


def test_ac_053_an_unknown_field_or_a_bad_type_is_refused_with_422() -> None:
    with TestClient(create_app(settings())) as client:
        unknown = client.post(
            "/v1/plans:analyze",
            json={**body(), "surprise": True},
            headers=HEADERS,
        )
        bad_type = client.post(
            "/v1/plans:analyze",
            json=body(options={**body()["options"], "teamSize": "many"}),
            headers=HEADERS,
        )

    assert unknown.status_code == 422
    assert unknown.json()["code"] == "ANALYZER_INVALID_REQUEST"
    assert bad_type.status_code == 422
    assert bad_type.json()["code"] == "ANALYZER_INVALID_REQUEST"


def test_ac_053_an_oversized_body_is_refused_with_413() -> None:
    # A small cap keeps the test honest without sending two megabytes
    with TestClient(create_app(settings(max_bytes=200))) as client:
        response = client.post("/v1/plans:analyze", json=body(), headers=HEADERS)

    assert response.status_code == 413
    assert response.json()["code"] == "ANALYZER_BODY_TOO_LARGE"


def test_ac_053_the_concurrency_cap_answers_429_with_retry_after(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def busy_slot() -> None:
        limiter = Limiter(1)
        await limiter._semaphore.acquire()  # the single slot is taken by another request
        try:
            async with limiter.slot():
                raise AssertionError("a second request entered the slot")
        finally:
            limiter._semaphore.release()

    with pytest.raises(AnalyzerError) as caught:
        asyncio.run(busy_slot())
    assert caught.value.status == 429
    assert caught.value.code == "ANALYZER_RATE_LIMITED"
    assert caught.value.retry_after == 5

    async def refuse(*_args: object, **_kwargs: object) -> str:
        raise AnalyzerError(429, "ANALYZER_RATE_LIMITED", "The analyzer is busy.", retry_after=5)

    monkeypatch.setattr("app.main.analyze", refuse)
    with TestClient(create_app(settings())) as client:
        response = client.post("/v1/plans:analyze", json=body(), headers=HEADERS)

    # The refusal reaches the caller with the header Node turns into a retry hint
    assert response.status_code == 429
    assert response.headers["Retry-After"] == "5"


# ---------------------------------------------------------------- AC-054


def test_ac_054_the_request_directory_is_removed_after_success_and_after_failure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    seen: list[Path] = []

    async def success(_settings: Settings, _query: str, _locale: str, storage: Path, **_kwargs: object) -> str:
        seen.append(storage)
        assert storage.exists()
        return markdown(plan())

    monkeypatch.setattr("app.analyze.generate_markdown", success)
    asyncio.run(analyze(AnalyzeRequest.model_validate(body()), settings()))
    assert seen and not seen[0].exists()

    async def failure(_settings: Settings, _query: str, _locale: str, storage: Path, **_kwargs: object) -> str:
        seen.append(storage)
        raise AnalyzerError(502, "ANALYZER_UNAVAILABLE", "DocuMind could not generate the plan.")

    monkeypatch.setattr("app.analyze.generate_markdown", failure)
    with pytest.raises(AnalyzerError):
        asyncio.run(analyze(AnalyzeRequest.model_validate(body()), settings()))
    assert not seen[-1].exists()


def test_ac_054_logs_carry_no_text_file_name_key_or_plan_content(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    async def fake_generate(*_args: object, **_kwargs: object) -> str:
        return markdown(plan())

    monkeypatch.setattr("app.analyze.generate_markdown", fake_generate)

    with caplog.at_level(logging.INFO, logger="document_analyzer"):
        asyncio.run(analyze(AnalyzeRequest.model_validate(body()), settings()))

    logged = caplog.text
    assert DOCUMENT_TEXT not in logged
    assert FILE_NAME not in logged
    assert PROVIDER_KEY not in logged
    assert TOKEN not in logged
    assert "Book an appointment" not in logged


# ---------------------------------------------------------------- AC-057


def _golden_fixture() -> dict:
    path = REPO_ROOT / "packages" / "contracts" / "fixtures" / "plan.golden.json"
    return json.loads(path.read_text(encoding="utf-8"))


def test_ac_057_the_shared_fixture_satisfies_both_the_jsonschema_and_the_pydantic_model() -> None:
    contract = json.loads(
        (REPO_ROOT / "packages" / "contracts" / "plan.contract.json").read_text(encoding="utf-8")
    )
    fixture = _golden_fixture()

    Draft202012Validator(contract).validate(fixture)
    # The same fixture the Node zod schema accepts is accepted here
    parsed = PlanContract.model_validate(fixture)
    assert parsed.project.key


def test_ac_057_a_fixture_that_no_longer_matches_the_contract_fails() -> None:
    contract = json.loads(
        (REPO_ROOT / "packages" / "contracts" / "plan.contract.json").read_text(encoding="utf-8")
    )
    broken = _golden_fixture()
    del broken["project"]

    with pytest.raises(JsonSchemaValidationError):
        Draft202012Validator(contract).validate(broken)
    with pytest.raises(PydanticValidationError):
        PlanContract.model_validate(broken)


# ---------------------------------------------------------------- AC-058


def test_ac_058_the_build_and_deployment_declare_the_service() -> None:
    dockerfile = (SERVICE_ROOT / "Dockerfile").read_text(encoding="utf-8")
    render = (REPO_ROOT / "render.yaml").read_text(encoding="utf-8")
    example = (SERVICE_ROOT / ".env.example").read_text(encoding="utf-8")

    # The image installs the locked environment, never a resolver result
    assert "uv sync --frozen" in dockerfile
    assert "COPY pyproject.toml uv.lock ./" in dockerfile

    # Render declares the analyzer as its own service and health-checks it on /healthz
    assert "dockerfilePath: ./services/document-analyzer/Dockerfile" in render
    assert "healthCheckPath: /healthz" in render

    # The example carries variable names and placeholders, never a real credential
    values = {}
    for line in example.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        name, value = stripped.split("=", 1)
        values[name.strip()] = value.strip()

    assert values["DOCUMENT_ANALYZER_TOKEN"].startswith("replace-with-")
    assert values["DOCUMIND_LLM_API_KEY"].startswith("replace-with-")
    assert all(not (len(value) >= 32 and value.isalnum()) for value in values.values())
