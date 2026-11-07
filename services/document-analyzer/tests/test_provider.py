"""The workspace provider block: the plan runs on the account that asked for it.

The service holds no provider credentials of its own -- no ``DOCUMIND_LLM_*`` is read at all -- so
the block is required rather than optional and there is nothing to fall back to. These tests pin the
mapping (workspace -> SDK keyword arguments), that no deployment value can leak into a plan, and
that the model reported back is the one that actually ran.
"""

from __future__ import annotations

import asyncio
import json

import pytest
from pydantic import ValidationError

from app.analyze import analyze
from app.config import ConfigurationError, Settings, load_settings
from app.contracts import AnalyzeRequest, WorkspaceLlm

WORKSPACE = {
    "model": "qwen-plus",
    "apiKey": "sk-workspace",
    "baseUrl": "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
}


def settings() -> Settings:
    return Settings(
        environment="development",
        token="t" * 40,
        max_chars=24_000,
        max_bytes=2_000_000,
        max_concurrency=2,
        timeout_seconds=30,
        port=8000,
    )


def workspace(**overrides: object) -> WorkspaceLlm:
    return WorkspaceLlm.model_validate({**WORKSPACE, **overrides})


def plan() -> dict:
    return {
        "project": {"name": "Shop", "key": "SHOP", "description": "", "color": "blue"},
        "sprints": [],
        "epics": [],
        "items": [
            {
                "ref": "T1", "sprintIndex": None, "epicRef": None, "title": "Buy a cart",
                "description": "", "type": "story", "priority": "medium", "storyPoints": 3,
                "labels": [], "acceptanceCriteria": [], "subtasks": [],
            }
        ],
        "assumptions": [],
        "risks": [],
    }


def markdown(payload: dict) -> str:
    head = '---\ntitle: "Plan"\n---\n\n## Plan JSON\n\n```json\n'
    return head + json.dumps(payload) + "\n```\n\n---\n"


def payload(llm: dict | None) -> dict:
    body: dict = {
        "contractVersion": 1,
        "requestId": "11111111-2222-4333-8444-555555555555",
        "document": {"fileName": "brief.md", "mimeType": "text/markdown", "text": "A shop."},
        "options": {"projectName": "", "projectKey": "", "sprintLengthWeeks": 2, "startDate": "2026-11-02"},
    }
    if llm is not None:
        body["llm"] = llm
    return body


class TestEngineKwargs:
    def test_the_workspace_endpoint_key_and_model_are_the_whole_configuration(self) -> None:
        assert settings().engine_kwargs(workspace()) == {
            "llm_provider": "custom",
            "use_default_models": True,
            "default_llm_model": "qwen-plus",
            "custom_llm_base_url": WORKSPACE["baseUrl"],
            "custom_llm_api_key": WORKSPACE["apiKey"],
            "custom_llm_model_name": "qwen-plus",
            "log_level": "INFO",
        }

    def test_a_second_workspace_never_sees_the_first_one(self) -> None:
        # Each request builds its own engine from its own block: nothing is carried between requests
        other = workspace(model="deepseek-chat", apiKey="sk-other", baseUrl="https://other.test/v1")
        kwargs = settings().engine_kwargs(other)
        assert kwargs["custom_llm_api_key"] == "sk-other"
        assert kwargs["custom_llm_base_url"] == "https://other.test/v1"
        assert kwargs["custom_llm_model_name"] == "deepseek-chat"
        assert "sk-workspace" not in json.dumps(kwargs)

    def test_no_deployment_provider_setting_is_read_at_all(self) -> None:
        # There is no fallback engine to reach for: the settings object has no provider of its own
        loaded = load_settings({"DOCUMENT_ANALYZER_TOKEN": "t" * 40})
        for field in ("provider", "model", "api_key", "base_url"):
            assert not hasattr(loaded, field), f"Settings.{field} should be gone"

    def test_a_trailing_slash_is_dropped_so_the_sdk_does_not_build_a_double_one(self) -> None:
        assert workspace(baseUrl="https://example.test/v1/").baseUrl == "https://example.test/v1"


class TestTheBlockIsRequired:
    def test_a_request_without_the_block_is_refused(self) -> None:
        # It used to be optional, and a request without it silently ran on the deployment's key.
        # Now there is no such key, so the door is the right place to refuse it.
        with pytest.raises(ValidationError):
            AnalyzeRequest.model_validate(payload(None))

    def test_a_production_that_never_had_a_provider_key_still_starts(self) -> None:
        # The key is per request now, so requiring one at startup would only stop the service
        loaded = load_settings({"ANALYZER_ENV": "production", "DOCUMENT_ANALYZER_TOKEN": "t" * 40})
        assert loaded.configured is True

    def test_a_short_production_token_is_still_refused(self) -> None:
        with pytest.raises(ConfigurationError):
            load_settings({"ANALYZER_ENV": "production", "DOCUMENT_ANALYZER_TOKEN": "short"})


class TestRequestCarriesIt:
    def test_the_block_reaches_the_engine_that_builds_the_sdk(self, monkeypatch: pytest.MonkeyPatch) -> None:
        seen: list[WorkspaceLlm | None] = []

        async def fake_generate(*_args: object, **kwargs: object) -> str:
            seen.append(kwargs.get("workspace"))  # type: ignore[arg-type]
            return markdown(plan())

        monkeypatch.setattr("app.analyze.generate_markdown", fake_generate)

        request = AnalyzeRequest.model_validate(payload(WORKSPACE))
        result = asyncio.run(analyze(request, settings()))

        assert seen == [workspace()]
        # The plan is stored with the model that produced it, not with this deployment's model
        assert result.analyzer.model == "qwen-plus"
        assert result.analyzer.engine == "documind"

    def test_a_block_without_a_model_is_refused(self) -> None:
        # The model is reported to the person who asked, so it must be the workspace's own
        with pytest.raises(ValidationError):
            AnalyzeRequest.model_validate(
                payload({"apiKey": "sk-workspace", "baseUrl": "https://example.test/v1"})
            )

    def test_the_retry_uses_the_same_workspace_provider(self, monkeypatch: pytest.MonkeyPatch) -> None:
        seen: list[object] = []

        async def fake_generate(*_args: object, **kwargs: object) -> str:
            seen.append(kwargs.get("workspace"))
            # First answer is prose: the request is retried once, and must stay on the same account
            return "```json\nA shop. Sprint 1 — the catalogue.\n```\n" if len(seen) == 1 else markdown(plan())

        monkeypatch.setattr("app.analyze.generate_markdown", fake_generate)

        result = asyncio.run(analyze(AnalyzeRequest.model_validate(payload(WORKSPACE)), settings()))

        assert len(seen) == 2
        assert seen[0] == seen[1] == workspace()
        assert result.plan.project.key == "SHOP"
