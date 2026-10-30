# Plan contract v1

`plan.contract.json` is the single machine-readable description of the plan object the
analyzer returns and Node finalises. `contractVersion` is `1`; a change to the shape requires
a new version and a matching update on both sides.

Both sides validate the same golden fixture:

- Python: `app/contracts.py` (`PlanContract.model_validate`)
- Node: the zod schema in `server/src/utils/ai/plan/schema.ts`

A change to one side without the other must fail the fixture check.
