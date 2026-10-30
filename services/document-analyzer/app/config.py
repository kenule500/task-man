"""Environment configuration for the document analyzer.

Every value is read from the environment on start. Production refuses to start without a
service token of at least 32 bytes and a provider key; the token and key are never logged.
"""

from __future__ import annotations

import os
from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import Any

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


class ConfigurationError(RuntimeError):
    """Raised when the service cannot start with the given environment."""


def _text(env: Mapping[str, str], name: str, default: str = "") -> str:
    return (env.get(name) or default).strip()


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
    extra: dict[str, str] = field(default_factory=dict)

    @property
    def production(self) -> bool:
        return self.environment.lower() != DEVELOPMENT

    @property
    def configured(self) -> bool:
        return bool(self.token) and bool(self.api_key)

    def engine_kwargs(self) -> dict[str, Any]:
        """Keyword arguments for ``documind.DocuMind`` (storage is added per request)."""
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
        port=_positive_int(source, "PORT", 8000, 65535),
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

