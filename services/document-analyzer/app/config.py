"""Environment configuration for the document analyzer.

Every value is read from the environment on start. Production refuses to start without a
service token of at least 32 bytes and a provider key; the token and key are never logged.
"""

from __future__ import annotations

import os
from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import Any

from .contracts import WorkspaceLlm

SDK_VERSION = "0.2.2"
DEVELOPMENT = "development"

SUPPORTED_PROVIDERS = (
    "openai",
    "anthropic",
    "azure",
    "bedrock",
    "gcp_vertex",
    "gemini",
    "ollama",
    "vllm",
    "custom",
)

DEFAULT_PROVIDER = "openai"
DEFAULT_MODEL = "gpt-4o"
DEFAULT_MAX_CHARS = 24_000
DEFAULT_MAX_BYTES = 2 * 1024 * 1024
DEFAULT_MAX_CONCURRENCY = 2
DEFAULT_TIMEOUT_SECONDS = 200
DEFAULT_PORT = 8000
MAX_PORT = 65535
# Transport retries inside the provider client are off (see app.engine): one retry there repeats
# a whole agent step. The cap was 4, from the assumption that a plan costs one document-generation
# step or two when the first answer wrote prose. A real run on 2026-11-05 disproved that: the
# pipeline built six provider clients for one plan on an OpenAI-compatible endpoint, so the sixth
# was refused. DocuMind catches that refusal and degrades into a document with no plan block, which
# the parser then rejects as "not one fenced JSON block" -- a cap that is too low is destructive,
# not protective, because the failure it causes is indistinguishable from a bad answer. Eight
# leaves room for the measured six plus one retry, and still stops a runaway pipeline well inside
# the request timeout (ANALYZER_TIMEOUT_SECONDS, 280 at most).
DEFAULT_MAX_PROVIDER_CALLS = 8


class ConfigurationError(RuntimeError):
    """Raised when the service cannot start with the given environment."""


def _text(env: Mapping[str, str], name: str, default: str = "") -> str:
    return (env.get(name) or default).strip()


_PLACEHOLDER_PREFIXES = ("replace-with-", "change-me", "changeme")


def _is_placeholder(value: str) -> bool:
    return value.strip().lower().startswith(_PLACEHOLDER_PREFIXES)


def _positive_int(env: Mapping[str, str], name: str, default: int, maximum: int) -> int:
    raw = _text(env, name)
    if not raw:
        return default
    try:
        value = int(raw)
    except ValueError as error:
        raise ConfigurationError(f"{name} must be an integer") from error
    if value <= 0 or value > maximum:
        raise ConfigurationError(f"{name} must be between 1 and {maximum}")
    return value


def _port(env: Mapping[str, str], name: str, default: int) -> int:
    """Resolve ``PORT`` for the container entrypoint.

    The service binds through uvicorn's ``--port`` flag, not through this value: it is read here
    only so a container setting is visible in the startup log. Some shells export an unusable
    ``PORT`` of their own (MSYS2/Git Bash export ``PORT=0``), and ``--env-file`` does not override
    a variable that is already set, so an unusable value falls back to the default instead of
    stopping startup. A genuinely wrong port still stops the container, because the entrypoint
    binds ``PORT`` itself.
    """
    raw = _text(env, name)
    if not raw:
        return default
    try:
        value = int(raw)
    except ValueError:
        return default
    return value if 0 < value <= MAX_PORT else default


@dataclass(frozen=True)
class Settings:
    environment: str
    token: str
    provider: str
    model: str
    api_key: str
    base_url: str | None
    max_chars: int
    max_bytes: int
    max_concurrency: int
    timeout_seconds: int
    port: int
    max_provider_calls: int = DEFAULT_MAX_PROVIDER_CALLS
    extra: dict[str, str] = field(default_factory=dict)

    @property
    def production(self) -> bool:
        return self.environment.lower() != DEVELOPMENT

    @property
    def configured(self) -> bool:
        return bool(self.token) and bool(self.api_key)

    def engine_kwargs(self, workspace: WorkspaceLlm | None = None) -> dict[str, Any]:
        """Keyword arguments for ``documind.DocuMind`` (storage is added per request).

        ``workspace`` is the BYOK provider of the workspace that queued the plan. When it is
        given it wins over this service's own ``DOCUMIND_LLM_*`` settings, so a plan runs on the
        endpoint, model and key of the workspace that asked for it, and a workspace never spends
        another workspace's (or the deployment's) allowance. The stored settings stay as the
        fallback for a request that carries no block.
        """
        if workspace is not None:
            # The SDK's ``custom`` provider is its OpenAI-compatible one: base URL, key and model
            # name are all supplied, so no default endpoint or model is consulted.
            return {
                "llm_provider": "custom",
                "use_default_models": True,
                "default_llm_model": workspace.model,
                "custom_llm_base_url": workspace.baseUrl,
                "custom_llm_api_key": workspace.apiKey,
                "custom_llm_model_name": workspace.model,
                "log_level": "INFO",
            }

        provider = self.provider
        key = self.api_key
        model = self.model
        base = self.base_url
        kwargs: dict[str, Any] = {
            "llm_provider": provider,
            "use_default_models": True,
            "default_llm_model": model,
            "log_level": "INFO",
        }

        if provider == "openai":
            kwargs["openai_api_key"] = key
            if base:
                kwargs["openai_base_url"] = base
        elif provider == "anthropic":
            kwargs["anthropic_api_key"] = key
        elif provider == "gemini":
            kwargs["google_api_key"] = key
        elif provider == "azure":
            kwargs["azure_openai_api_key"] = key
            kwargs["azure_openai_endpoint"] = base or ""
            kwargs["azure_openai_deployment"] = model
            kwargs["azure_openai_api_version"] = self.extra.get(
                "azure_api_version", "2024-02-15-preview"
            )
        elif provider == "bedrock":
            kwargs["aws_region"] = self.extra.get("aws_region", "us-east-1")
            if key:
                kwargs["aws_access_key_id"] = key
            secret = self.extra.get("aws_secret_access_key", "")
            if secret:
                kwargs["aws_secret_access_key"] = secret
        elif provider == "gcp_vertex":
            kwargs["gcp_project_id"] = self.extra.get("gcp_project_id", "")
            kwargs["gcp_location"] = self.extra.get("gcp_location", "us-central1")
            credentials = self.extra.get("google_application_credentials", "")
            if credentials:
                kwargs["google_application_credentials"] = credentials
        else:  # ollama, vllm or custom: OpenAI-compatible endpoint
            kwargs["custom_llm_base_url"] = base or self._default_base(provider)
            kwargs["custom_llm_api_key"] = key
            kwargs["custom_llm_model_name"] = model

        return kwargs

    @staticmethod
    def _default_base(provider: str) -> str:
        if provider == "ollama":
            return "http://127.0.0.1:11434/v1"
        if provider == "vllm":
            return "http://127.0.0.1:8001/v1"
        return ""

    def validate(self) -> None:
        if self.provider not in SUPPORTED_PROVIDERS:
            raise ConfigurationError(
                f"DOCUMIND_LLM_PROVIDER must be one of: {', '.join(SUPPORTED_PROVIDERS)}"
            )
        if _is_placeholder(self.token):
            raise ConfigurationError(
                "DOCUMENT_ANALYZER_TOKEN is still the placeholder; generate a real 32+ byte token"
            )
        if _is_placeholder(self.api_key):
            raise ConfigurationError(
                "DOCUMIND_LLM_API_KEY is still the placeholder; use a real provider key"
            )
        if self.provider in {"azure", "custom"} and not self.base_url:
            raise ConfigurationError("DOCUMIND_LLM_BASE_URL is required for this provider")
        if self.provider == "gcp_vertex" and not self.extra.get("gcp_project_id"):
            raise ConfigurationError("DOCUMIND_GCP_PROJECT_ID is required for gcp_vertex")
        if not self.production:
            return
        if len(self.token) < 32:
            raise ConfigurationError(
                "DOCUMENT_ANALYZER_TOKEN must be at least 32 bytes outside development"
            )
        if not self.api_key:
            raise ConfigurationError("DOCUMIND_LLM_API_KEY is required outside development")


def load_settings(env: Mapping[str, str] | None = None) -> Settings:
    source: Mapping[str, str] = os.environ if env is None else env
    provider = _text(source, "DOCUMIND_LLM_PROVIDER", DEFAULT_PROVIDER).lower()
    settings = Settings(
        environment=_text(source, "ANALYZER_ENV", DEVELOPMENT),
        token=_text(source, "DOCUMENT_ANALYZER_TOKEN"),
        provider=provider,
        model=_text(source, "DOCUMIND_LLM_MODEL", DEFAULT_MODEL),
        api_key=_text(source, "DOCUMIND_LLM_API_KEY"),
        base_url=_text(source, "DOCUMIND_LLM_BASE_URL") or None,
        max_chars=_positive_int(source, "ANALYZER_MAX_CHARS", DEFAULT_MAX_CHARS, 200_000),
        max_bytes=_positive_int(
            source, "ANALYZER_MAX_BYTES", DEFAULT_MAX_BYTES, 10 * 1024 * 1024
        ),
        max_concurrency=_positive_int(
            source, "ANALYZER_MAX_CONCURRENCY", DEFAULT_MAX_CONCURRENCY, 16
        ),
        timeout_seconds=_positive_int(
            source, "ANALYZER_TIMEOUT_SECONDS", DEFAULT_TIMEOUT_SECONDS, 280
        ),
        port=_port(source, "PORT", DEFAULT_PORT),
        max_provider_calls=_positive_int(
            source, "ANALYZER_MAX_PROVIDER_CALLS", DEFAULT_MAX_PROVIDER_CALLS, 16
        ),
        extra={
            "aws_region": _text(source, "DOCUMIND_AWS_REGION", "us-east-1"),
            "aws_secret_access_key": _text(source, "DOCUMIND_AWS_SECRET_ACCESS_KEY"),
            "azure_api_version": _text(
                source, "DOCUMIND_AZURE_API_VERSION", "2024-02-15-preview"
            ),
            "gcp_project_id": _text(source, "DOCUMIND_GCP_PROJECT_ID"),
            "gcp_location": _text(source, "DOCUMIND_GCP_LOCATION", "us-central1"),
            "google_application_credentials": _text(
                source, "DOCUMIND_GOOGLE_APPLICATION_CREDENTIALS"
            ),
        },
    )
    settings.validate()
    return settings
