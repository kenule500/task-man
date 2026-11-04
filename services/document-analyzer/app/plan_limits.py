"""The plan limits mirrored from ``PLAN_LIMITS`` in ``services/api/src/utils/ai/plan/schema.ts``.

``tests/test_contracts.py`` (Python) and ``services/api/src/__tests__/aiPlanContract.test.ts`` (Node)
both compare these against the shared ``packages/contracts/plan.contract.json``, so a change on one
side alone fails a check instead of drifting.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class _PlanLimits:
    sprints: int = 8
    epics: int = 12
    items: int = 120
    notes: int = 12
    subtasks_total: int = 300
    # The Fibonacci scale a story point estimate snaps to
    points: tuple[int, ...] = (1, 2, 3, 5, 8, 13)


PLAN_LIMITS = _PlanLimits()
