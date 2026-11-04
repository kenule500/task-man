"""Concurrency and timeout guards."""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator, Awaitable
from contextlib import asynccontextmanager
from typing import TypeVar

from .contracts import AnalyzerError

T = TypeVar("T")

RETRY_AFTER_SECONDS = 5


class Limiter:
    """At most ``limit`` generations run at once; excess requests are shed with 429."""

    def __init__(self, limit: int) -> None:
        self._semaphore = asyncio.Semaphore(limit)

    @asynccontextmanager
    async def slot(self) -> AsyncIterator[None]:
        try:
            await asyncio.wait_for(self._semaphore.acquire(), timeout=0.05)
        except TimeoutError as error:
            raise AnalyzerError(
                429,
                "ANALYZER_RATE_LIMITED",
                "The analyzer is busy. Try again shortly.",
                retry_after=RETRY_AFTER_SECONDS,
            ) from error
        try:
            yield
        finally:
            self._semaphore.release()


async def with_timeout(work: Awaitable[T], seconds: int) -> T:
    try:
        return await asyncio.wait_for(work, timeout=seconds)
    except TimeoutError as error:
        raise AnalyzerError(
            504,
            "ANALYZER_TIMEOUT",
            "The analyzer took too long to answer. Try again or use a shorter document.",
        ) from error
