# Plan contract v1

`plan.contract.json` is the single machine-readable description of the plan object the
analyzer returns and Node finalises. `contractVersion` is `1`; a change to the shape requires
a new version and a matching update on both sides.

Both sides validate the same golden fixture:

- Python: `services/document-analyzer/tests/test_contracts.py` (`PlanContract.model_validate`)
- Node: `services/api/src/__tests__/aiPlanContract.test.ts` (`modelPlanSchema`, `finalizePlan`)

A change to one side without the other must fail one of those suites. They also compare the
plan limits, so the `maxItems` values here, `PLAN_LIMITS` in
`services/api/src/utils/ai/plan/schema.ts` and `app/plan_limits.py` cannot drift apart.

## Repair, don't refuse

The schema describes the **finalised** plan: unique refs that resolve, `epicRef` and
`sprintIndex` that are valid or `null`, at least one item, and a `storyPoints` value on the
Fibonacci scale. The model does not reliably produce that, so neither side refuses the model's
small deviations — both repair them the same way:

| The model sends | Both sides keep |
|---|---|
| An unknown field | It is dropped |
| A missing field | Its default (`task`, `medium`, no estimate, empty lists) |
| `storyPoints` off the scale | The nearest Fibonacci step: 4 → 5, 10 → 8, 20 → 13 |
| A duplicate or unreadable `ref` | A free ref, renumbered |
| An `epicRef` or `sprintIndex` that points nowhere | `null` (no epic, backlog) |
| More sprints, epics, items, notes or subtasks than the limits | The first ones, up to the limit |
| No items at all | A refusal (`ANALYZER_INVALID_OUTPUT`) |

The analyzer repairs on validation (`app/contracts.py`); Node repairs in `finalizePlan` and
reports it (`plan.repaired`) instead of failing the request. Output that cannot be read at all
(unreadable, cut off, more than one JSON object) is refused before this contract applies.
