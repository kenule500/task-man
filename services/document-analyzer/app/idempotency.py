"""Short-lived memory of finished answers, so a repeated request id cannot generate twice.

The service stays stateless otherwise: this is a bounded, per-instance cache used only for
idempotency. A retried POST carrying the same ``requestId`` gets the answer it already produced
(and is not charged a second DocuMind run); a failure is never cached, so a retry can succeed.
"""

from __future__ import annotations

import time
from collections import OrderedDict

from .contracts import AnalyzeResponse

DEFAULT_TTL_SECONDS = 600.0
DEFAULT_LIMIT = 32


class ResponseCache:
    def __init__(self, ttl_seconds: float = DEFAULT_TTL_SECONDS, limit: int = DEFAULT_LIMIT) -> None:
        self._ttl = max(1.0, float(ttl_seconds))
        self._limit = max(1, int(limit))
        self._items: OrderedDict[str, tuple[float, dict]] = OrderedDict()

    def _prune(self, now: float) -> None:
        while self._items:
            _, (stored_at, _payload) = next(iter(self._items.items()))
            if now - stored_at <= self._ttl:
                break
            self._items.popitem(last=False)

    def get(self, request_id: str) -> AnalyzeResponse | None:
        """The stored answer for this request id, or ``None`` when it was never seen or has expired."""
        now = time.monotonic()
        self._prune(now)
        entry = self._items.get(request_id)
        if entry is None:
            return None
        return AnalyzeResponse.model_validate(entry[1])

    def put(self, request_id: str, response: AnalyzeResponse) -> None:
        now = time.monotonic()
        self._prune(now)
        self._items[request_id] = (now, response.model_dump(mode="json"))
        self._items.move_to_end(request_id)
        while len(self._items) > self._limit:
            self._items.popitem(last=False)

    def __len__(self) -> int:
        return len(self._items)
