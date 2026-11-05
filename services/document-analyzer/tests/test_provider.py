"""The workspace provider block: the plan runs on the account that asked for it.

The API holds the workspace's decrypted key, so it travels with the request and the analyzer hands
it to the SDK. These tests pin the mapping (workspace -> SDK keyword arguments), the precedence
over this deployment's own ``DOCUMIND_LLM_*`` settings, and that the model reported back is the one
that actually ran.
"""

from __future__ import annotations

import asyncio
import json

import pytest

from app.analyze import analyze
from app.config import Settings
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
        provider="custom",
        model="model-1",
        api_key="sk-deployment",
        base_url="https://deployment.invalid/v1",
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
    def test_the_workspace_endpoint_key_and_model_replace_the_service_settings(self) -> None:
        assert settings().engine_kwargs(workspace()) == {
            "llm_provider": "custom",
            "use_default_models": True,
            "default_llm_model": "qwen-plus",
            "custom_llm_base_url": WORKSPACE["baseUrl"],
            "custom_llm_api_key": WORKSPACE["apiKey"],
            "custom_llm_model_name": "qwen-plus",
            "log_level": "INFO",
        }

    def test_the_deployment_settings_still_apply_without_a_workspace_block(self) -> None:
        kwargs = settings().engine_kwargs()
        assert kwargs["custom_llm_base_url"] == "https://deployment.invalid/v1"
        assert kwargs["custom_llm_api_key"] == "sk-deployment"
        assert kwargs["custom_llm_model_name"] == "model-1"

    def test_no_workspace_value_is_borrowed_from_the_other(self) -> None:
        # A custom endpoint preset resolves nothing: every value comes from the request
        kwargs = settings().engine_kwargs(workspace())
        assert "sk-deployment" not in json.dumps(kwargs)
        assert "deployment.invalid" not in json.dumps(kwargs)

    def test_a_trailing_slash_is_dropped_so_the_sdk_does_not_build_a_double_one(self) -> None:
        assert workspace(baseUrl="https://example.test/v1/").baseUrl == "https://example.test/v1"


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

    def test_the_deployment_model_is_reported_when_no_block_is_sent(self, monkeypatch: pytest.MonkeyPatch) -> None:
        async def fake_generate(*_args: object, **_kwargs: object) -> str:
            return markdown(plan())

        monkeypatch.setattr("app.analyze.generate_markdown", fake_generate)

        result = asyncio.run(analyze(AnalyzeRequest.model_validate(payload(None)), settings()))

        assert result.analyzer.model == "model-1"

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
