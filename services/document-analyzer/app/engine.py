"""DocuMind engine adapter.

The SDK is imported lazily so the service can start, lint and serve ``/healthz`` in an
environment where the (large) DocuMind dependency tree is not installed. The SDK is used for
what it actually does: generating a Markdown document from a query.

One request makes exactly one ``generate`` call. The SDK's own agents may call the provider
several times; they are counted here (no content is touched) so the cost of a plan is measured
rather than assumed — that is the number RISK-022 asks for — and capped, so a slow provider
cannot keep one plan calling until the request times out.

Two SDK behaviours are neutralised here, because for this service they are pure overhead:

``needs_research``
    ``DocuMind.generate(needs_research=None)`` makes the SDK *infer* the flag with
    ``analyze_research_intent`` — a whole extra provider call, whose only effect is to decide
    whether even more work is done. Web research is never wanted here: the brief is a plan
    generated from the uploaded text, every outbound search in this pipeline fails on DNS
    anyway, and "research" answers would be injected into the plan as evidence nobody can
    verify. ``needs_research=False`` is therefore always passed, which skips the intent call.

Provider retries
    The SDK builds its clients through ``create_llm`` with the provider library's default retry
    policy (the OpenAI SDK retries twice by default). One retried call repeats a whole agent
    step inside the same request, which is what made one analysis cost four to five provider
    calls. ``create_llm`` is wrapped once so every client is built with ``max_retries=0``:
    retrying a plan belongs to the caller that knows the time budget, not to the transport.
"""

from __future__ import annotations

from collections.abc import Callable
from contextvars import ContextVar
from pathlib import Path
from typing import Any

from .config import Settings
from .contracts import AnalyzerError, WorkspaceLlm

_provider_calls: ContextVar[list[int] | None] = ContextVar("provider_calls", default=None)
_provider_budget: ContextVar[int] = ContextVar("provider_budget", default=0)
_hooks_installed = False


class ProviderBudgetExceededError(AnalyzerError):
    """The request asked the provider for more calls than one plan may cost."""

    def __init__(self, limit: int) -> None:
        super().__init__(
            502,
            "ANALYZER_UNAVAILABLE",
            "The document analyzer needed more model calls than a single plan allows. "
            "Try again with a shorter document.",
        )
        self.limit = limit


def _increment_provider_calls() -> None:
    # A mutable holder: the SDK's agents run in child tasks, whose context copies would otherwise
    # hide their increments from the request that awaits them.
    counter = _provider_calls.get()
    if counter is not None:
        counter[0] += 1


def _check_provider_budget() -> None:
    budget = _provider_budget.get()
    if budget and provider_call_count() > budget:
        raise ProviderBudgetExceededError(budget)


def _install_hooks() -> None:
    """Wrap the SDK's LLM factory once: count provider calls, cap them, disable retries.

    Wrapping the factory (rather than each provider) covers OpenAI-compatible, Anthropic, Azure,
    Bedrock, ... in one place. ``max_retries`` is only added when the caller did not set it, and
    that is the keyword LangChain forwards to the provider client.
    """
    global _hooks_installed
    if _hooks_installed:
        return
    from src.infrastructure import llm as sdk_llm

    original: Callable[..., Any] = sdk_llm.create_llm

    def counting_create_llm(*args: Any, **kwargs: Any) -> Any:
        _check_provider_budget()
        _increment_provider_calls()
        kwargs.setdefault("max_retries", 0)
        return original(*args, **kwargs)

    sdk_llm.create_llm = counting_create_llm
    _hooks_installed = True


def begin_provider_call_count(limit: int = 0) -> None:
    """Starts counting provider calls for the current request.

    Called from the request handler, not from inside ``analyze``: the SDK runs in child tasks,
    and a holder created there would not be visible to the handler that reads the total.
    ``limit`` of 0 disables the cap (tests, and a permissive deployment opt-out).
    """
    _install_hooks()
    _provider_calls.set([0])
    _provider_budget.set(max(0, int(limit)))


def provider_call_count() -> int:
    """Provider calls made by the current request so far."""
    counter = _provider_calls.get()
    return counter[0] if counter else 0


def _documind_class() -> Any:
    try:
        from documind import DocuMind
    except Exception as error:  # pragma: no cover - depends on the deployment image
        raise AnalyzerError(
            503,
            "ANALYZER_NOT_CONFIGURED",
            "The DocuMind SDK is not available in this service.",
        ) from error
    return DocuMind


def create_engine(
    settings: Settings, storage_path: Path, workspace: WorkspaceLlm | None = None
) -> Any:
    """One engine per request, so generated files land in this request's private directory.

    ``workspace`` carries the provider of the workspace that asked for the plan; the SDK is built
    on it when it is present, so the endpoint, model and key of that workspace are what the
    pipeline calls. The key is passed through to the SDK and appears nowhere else: it is not
    logged here, not stored, and not part of any message this module raises.
    """
    engine_class = _documind_class()
    return engine_class(
        **settings.engine_kwargs(workspace), storage_local_path=str(storage_path)
    )


async def generate_markdown(
    settings: Settings,
    query: str,
    locale: str,
    storage_path: Path,
    workspace: WorkspaceLlm | None = None,
) -> str:
    # The counter itself is started by the request handler (see begin_provider_call_count)
    _install_hooks()
    engine = create_engine(settings, storage_path, workspace)
    try:
        result = await engine.generate(
            query=query,
            format="md",
            locale=locale,
            # Never None: None makes the SDK spend a provider call inferring this, and the
            # answer would only ever turn web research on. The brief needs no external facts.
            needs_research=False,
        )
    except AnalyzerError:
        raise
    except Exception as error:  # pragma: no cover - the SDK raises provider-specific errors
        raise AnalyzerError(
            502,
            "ANALYZER_UNAVAILABLE",
            "DocuMind could not generate the plan. Try again.",
        ) from error

    errors = getattr(result, "errors", None) or []
    output_path = getattr(result, "output_path", None)
    if errors or not output_path:
        raise AnalyzerError(
            502, "ANALYZER_UNAVAILABLE", "DocuMind did not produce a document."
        )

    path = Path(output_path)
    try:
        return path.read_text(encoding="utf-8")
    except OSError as error:
        raise AnalyzerError(
            502,
            "ANALYZER_UNAVAILABLE",
            "The generated document could not be read.",
        ) from error
