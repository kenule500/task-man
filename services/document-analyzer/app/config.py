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

DEFAULT_MAX_CHARS = 24_000
DEFAULT_MAX_BYTES = 2 * 1024 * 1024
DEFAULT_MAX_CONCURRENCY = 2
# One analyzer call may take this long. It is deliberately below the API's plan budget (300 s) and the
# Vercel function limit, so a page that overruns is cut with ANALYZER_TIMEOUT and the API can keep the
# pages it already has instead of the whole request being killed by the host.
DEFAULT_TIMEOUT_SECONDS = 280
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
# the request timeout (ANALYZER_TIMEOUT_SECONDS, 280 by default).
DEFAULT_MAX_PROVIDER_CALLS = 8
# One analyzer call may take this long. It is deliberately below the API's plan budget (300 s) and the
# Vercel function limit, so a page that overruns is cut with ANALYZER_TIMEOUT and the API can keep the
# pages it already has instead of the whole request being killed by the host.
DEFAULT_TIMEOUT_SECONDS = 280


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
        return bool(self.token)

    def engine_kwargs(self, workspace: WorkspaceLlm) -> dict[str, Any]:
        """Keyword arguments for ``documind.DocuMind`` (storage is added per request).

        Every plan runs on the workspace that asked for it: the endpoint, model and key travel in
        the request, so this service holds no provider credentials and can spend no allowance but
        that workspace's own. The key is handed straight to the SDK and appears nowhere else -- not
        in a log, not in an answer, not in an exception message.

        The SDK's ``custom`` provider is its OpenAI-compatible one, which is what every workspace
        preset is (see ``AI_PROVIDER_PRESETS`` in the API), so base URL, key and model name are all
        supplied and no default endpoint or model of the SDK is consulted.
        """
        return {
            "llm_provider": "custom",
            "use_default_models": True,
            "default_llm_model": workspace.model,
            "custom_llm_base_url": workspace.baseUrl,
            "custom_llm_api_key": workspace.apiKey,
            "custom_llm_model_name": workspace.model,
            "log_level": "INFO",
        }

    def validate(self) -> None:
        if _is_placeholder(self.token):
            raise ConfigurationError(
                "DOCUMENT_ANALYZER_TOKEN is still the placeholder; generate a real 32+ byte token"
            )
        if not self.production:
            return
        if len(self.token) < 32:
            raise ConfigurationError(
                "DOCUMENT_ANALYZER_TOKEN must be at least 32 bytes outside development"
            )
        # No provider key is required: there is no deployment-wide provider any more, so that check
        # would only stop the service from starting. A request without a workspace block is refused
        # by the request contract instead (see AnalyzeRequest.llm).


def load_settings(env: Mapping[str, str] | None = None) -> Settings:
    source: Mapping[str, str] = os.environ if env is None else env
    settings = Settings(
        environment=_text(source, "ANALYZER_ENV", DEVELOPMENT),
        token=_text(source, "DOCUMENT_ANALYZER_TOKEN"),
        max_chars=_positive_int(source, "ANALYZER_MAX_CHARS", DEFAULT_MAX_CHARS, 200_000),
        max_bytes=_positive_int(
            source, "ANALYZER_MAX_BYTES", DEFAULT_MAX_BYTES, 10 * 1024 * 1024
        ),
        max_concurrency=_positive_int(
            source, "ANALYZER_MAX_CONCURRENCY", DEFAULT_MAX_CONCURRENCY, 16
        ),
        timeout_seconds=_positive_int(
            source, "ANALYZER_TIMEOUT_SECONDS", DEFAULT_TIMEOUT_SECONDS, 600
        ),
        port=_port(source, "PORT", DEFAULT_PORT),
        max_provider_calls=_positive_int(
            source, "ANALYZER_MAX_PROVIDER_CALLS", DEFAULT_MAX_PROVIDER_CALLS, 16
        ),
    )
    settings.validate()
    return settings
