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

    One retry does happen here, on the *model call* that failed (see ``_RecordingChatModel``), and
    only for a transient failure: a provider server error (5xx) or a connection dropped mid-answer.
    Those cost one plan for a reason that has nothing to do with the workspace's settings, and DocuMind
    turns them into a document without a plan block rather than an error, so without this retry the
    person is told to check a configuration that was never wrong. A refused key, an exhausted balance
    or an unknown model is not retried: the same refusal would come back and spend another run.
"""

from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import Callable
from contextvars import ContextVar
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .config import Settings
from .contracts import AnalyzerError, WorkspaceLlm

_provider_calls: ContextVar[list[int] | None] = ContextVar("provider_calls", default=None)
_provider_budget: ContextVar[int] = ContextVar("provider_budget", default=0)
# Why the provider last refused a call in this request, as a small safe label (never the provider's
# own text). DocuMind's agents catch a failed model call and continue with an empty plan, so this is
# the only place the refusal can still be seen: without it the request would end as "no plan block".
_provider_failures: ContextVar[list[ProviderFailure] | None] = ContextVar(
    "provider_failures", default=None
)
# How many model calls have answered in this request. A recorded failure is only the reason a plan is
# missing when no call answered after it: an agent that fell back to a default and was followed by a
# working call is not what cost the plan.
_provider_answers: ContextVar[list[int] | None] = ContextVar("provider_answers", default=None)
_hooks_installed = False

# How long to wait before the one retry of a transient provider failure. Short: the provider has
# already had the length of the failed call to recover, and the request has a total time budget.
_RETRY_DELAY_SECONDS = 1.0

# HTTP statuses a provider uses for the refusals that have a distinct fix. Anything else is
# "error", and a transport failure is "unreachable". The labels are all the caller gets: the
# provider's message can carry account details, so it is never copied out of the exception.
_PROVIDER_STATUS = {
    400: "rejected",
    401: "auth",
    402: "quota",
    403: "auth",
    404: "model",
    408: "unavailable",
    413: "rejected",
    422: "rejected",
    429: "quota",
    500: "unavailable",
    502: "unavailable",
    503: "unavailable",
    504: "unavailable",
    529: "unavailable",
}
# Markers in the exception class name. "Unreachable" is the endpoint never answering (a wrong or
# dead host); "unavailable" is the provider failing to finish an answer it had accepted, which is
# worth one retry. ``_transport_names`` also looks at the wrapped cause, because the provider client
# reports every transport problem as one connection class and keeps the real one as the cause.
_UNREACHABLE_MARKERS = ("connection", "connect", "dns", "network")
_TRANSIENT_MARKERS = ("timeout", "read", "protocol", "reset", "brokenpipe", "incomplete")
# The subset of those that can only happen after the request reached the provider: the answer began
# and was cut, so nothing about the endpoint is wrong and the call deserves one more attempt.
_MID_ANSWER_MARKERS = ("read", "protocol", "reset", "brokenpipe", "incomplete")


@dataclass(frozen=True)
class ProviderFailure:
    """A refused model call: a safe label, the exception class and its HTTP status.

    The class name and the status are for the analyzer's own log -- they name the transport, not the
    account -- and the provider's own message is never kept, because it can carry an account or a
    request id. ``answers`` is how many calls had answered when this one failed, so a later answer
    can tell ``provider_failure`` that the pipeline recovered.
    """

    reason: str
    error: str
    status: int | None
    answers: int


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


def _provider_status(error: BaseException) -> int | None:
    """The HTTP status a provider client attached to ``error``, if any."""
    for attribute in ("status_code", "status", "http_status"):
        value = getattr(error, attribute, None)
        if isinstance(value, int):
            return value
    response = getattr(error, "response", None)
    value = getattr(response, "status_code", None)
    return value if isinstance(value, int) else None


def _transport_names(error: BaseException) -> set[str]:
    """The exception's class name and the class name of what it wraps, lower-cased.

    A provider client reports every transport problem as one connection class and keeps the
    underlying one (a read timeout, a reset connection, a DNS failure) as the ``__cause__``. Both are
    needed: only the cause says whether the answer was cut off after the provider had accepted it.
    """
    names = {type(error).__name__.lower()}
    cause = error.__cause__ or error.__context__
    if cause is not None:
        names.add(type(cause).__name__.lower())
    return names


def classify_provider_error(error: BaseException) -> str:
    """A small, safe label for a refused model call: never the provider's own message.

    ``quota`` covers both a rate limit (429) and an account with no balance or plan (402),
    because the person fixes both in the same place. ``unreachable`` is an endpoint that could not
    be dialled. ``unavailable`` is the provider failing after it accepted the request -- a server
    error or a connection dropped mid-answer -- which the person fixes by trying again, not by
    changing a setting.
    """
    status = _provider_status(error)
    if status in _PROVIDER_STATUS:
        return _PROVIDER_STATUS[status]
    if status is not None and 500 <= status < 600:
        return "unavailable"
    names = _transport_names(error)
    cause = error.__cause__ or error.__context__
    cause_name = type(cause).__name__.lower() if cause is not None else ""
    # The wrapped cause is more precise than the one class the client reports for every transport
    # problem: a read or a protocol failure means the request was sent and the answer was cut, a
    # connect failure means it never got there.
    if any(marker in cause_name for marker in _MID_ANSWER_MARKERS):
        return "unavailable"
    if any(marker in name for name in names for marker in _UNREACHABLE_MARKERS):
        return "unreachable"
    if any(marker in name for name in names for marker in _TRANSIENT_MARKERS):
        return "unavailable"
    return "error"


def is_transient_failure(error: BaseException) -> bool:
    """True for a failure that one more identical call may not repeat.

    Only the two transport classes qualify: the provider had accepted the request and then failed to
    answer. A refused key, an exhausted balance, an unknown model and a rejected request are
    deterministic, so retrying them would only spend another run on the same refusal.
    """
    return classify_provider_error(error) in ("unavailable", "unreachable")


def _provider_answer_count() -> int:
    counter = _provider_answers.get()
    return counter[0] if counter else 0


def _record_provider_answer() -> None:
    # Same mutable-holder reason as ``_increment_provider_calls``: the SDK's child tasks share it
    counter = _provider_answers.get()
    if counter is not None:
        counter[0] += 1


def _record_provider_failure(error: BaseException) -> None:
    failures = _provider_failures.get()
    if failures is not None:
        failures.append(
            ProviderFailure(
                reason=classify_provider_error(error),
                # The class name only: the provider's message can carry an account or request id
                error=type(error).__name__[:60],
                status=_provider_status(error),
                answers=_provider_answer_count(),
            )
        )


def provider_failure() -> ProviderFailure | None:
    """The last provider refusal seen by this request that no later call recovered from, or None.

    The last one is reported: when an early agent's call is refused but the planner's is too, the
    planner's refusal is the one that cost the plan. A refusal followed by a call that answered is
    *not* reported -- the pipeline carried on past it, so calling it the cause of a missing plan would
    point the person at a setting that was never wrong, and would skip the repair run in ``analyze``.
    The request handler creates the holder, so the SDK's child tasks share it (see
    ``begin_provider_call_count``).
    """
    failures = _provider_failures.get()
    if not failures:
        return None
    last = failures[-1]
    return None if _provider_answer_count() > last.answers else last


class _RecordingChatModel:
    """Delegates to the SDK's chat model, recording a refused ``ainvoke``.

    DocuMind catches that exception inside each agent and falls back to an empty document plan,
    which the parser can only report as a missing JSON block. Wrapping the one method the
    document pipeline calls keeps the refusal visible without changing the SDK. Every other
    attribute (and runnable composition) is the real model's, so callers that expect a chat
    model keep working.

    A transient failure is retried once *here*, at the model call, not at the plan: the provider
    dropped an answer it had already accepted, which is one call, not one agent step. DocuMind turns
    that into an empty plan, so without this the plan fails for a reason the workspace cannot fix.
    """

    __slots__ = ("_model",)

    def __init__(self, model: Any) -> None:
        object.__setattr__(self, "_model", model)

    def __getattr__(self, name: str) -> Any:
        return getattr(object.__getattribute__(self, "_model"), name)

    def __or__(self, other: Any) -> Any:
        return object.__getattribute__(self, "_model") | other

    def __ror__(self, other: Any) -> Any:
        return other | object.__getattribute__(self, "_model")

    async def ainvoke(self, *args: Any, **kwargs: Any) -> Any:
        model = object.__getattribute__(self, "_model")
        try:
            answer = await model.ainvoke(*args, **kwargs)
        except Exception as error:
            if not is_transient_failure(error):
                _record_provider_failure(error)
                raise
            logging.getLogger("document_analyzer").warning(
                json.dumps(
                    {
                        "event": "plan_provider_retry",
                        "reason": classify_provider_error(error),
                        "error": type(error).__name__[:60],
                    },
                    separators=(",", ":"),
                )
            )
            await asyncio.sleep(_RETRY_DELAY_SECONDS)
            try:
                answer = await model.ainvoke(*args, **kwargs)
            except Exception as retried:
                _record_provider_failure(retried)
                raise
        _record_provider_answer()
        return answer


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
        return _RecordingChatModel(original(*args, **kwargs))

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
    _provider_failures.set([])
    _provider_answers.set([0])
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


def create_engine(settings: Settings, storage_path: Path, workspace: WorkspaceLlm) -> Any:
    """One engine per request, so generated files land in this request's private directory.

    ``workspace`` carries the provider of the workspace that asked for the plan: it is the only
    provider there is, because this service stores no credentials of its own. The key is passed
    through to the SDK and appears nowhere else: it is not logged here, not stored, and not part of
    any message this module raises.
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
    workspace: WorkspaceLlm,
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
