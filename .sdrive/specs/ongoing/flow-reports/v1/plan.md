# Technical plan — flow reports

> **Retroactive plan** — documents the design that already exists in the codebase (onboarded 2026-10-16). Not authored upfront.

- **Feature:** `flow-reports` · **Version:** 1
- **Spec:** `.sdrive/specs/ongoing/flow-reports/v1/spec.md`
- **Governance:** `.sdrive/governance/flow-reports/v1/plan.json`

## Notation used below

- `action` on a component: `create` = module owned by this feature, `modify` = shared module this feature extends,
  `reuse` = shared module used unchanged.
- `action` on a data-model entity or field: `no_change` (no schema change is part of this feature).
- `action` on an API contract: `create` = endpoint owned by this feature.

## Architecture

Flow reporting is a read-only projection of two things the application already writes: the task list and the status
moves. The moves are captured at the source by a listener on the activity stream, so no controller has to know about
retention or reporting:

```
task create/update -> recordActivity -> onActivity -> trackStatusTransition -> StatusTransition row
                                                                                     |
GET /reports/flow -> parseFlowQuery -> tasks + transitions + assignee profiles --> metrics.ts (pure) -> JSON
```

`server/src/utils/flow/metrics.ts` has no database or HTTP access (CON-109): it takes transitions, tasks and a day
range and returns the cumulative flow, cycle and lead time, throughput and aging figures, which is what makes the
whole computation unit-testable without MongoDB (CON-407). The handler only validates the query, loads the data with
explicit field selections and serialises the payload. The client mirrors the payload in `types.ts`, fetches it
through the shared axios instance (CON-207) and renders the Flow tab.

### Components

| Component | Action | Role |
|---|---|---|
| `server/src/models/statusTransitionModel.ts` | create | One row per move; indexed by `{ workspace, at }` and `{ workspace, task, at }`; no TTL so history stays. |
| `server/src/utils/flow/register.ts` | create | `registerFlowTracking`, `trackStatusTransition`, `registered` guard. |
| `server/src/app.ts` | modify | Calls `registerFlowTracking()` before the automation and webhook listeners. |
| `server/src/utils/flow/metrics.ts` | create | Pure metrics and the report assembly (`buildFlowReport`). |
| `server/src/controllers/flowController.ts` | create | `queryString`, `parseFlowQuery`, `getFlowReport`. |
| `server/src/routes/workspaceRoutes.ts` | modify | `GET /:slug/reports/flow` with `protect` + `requirePermission('projects:read')`. |
| `client/src/features/flow/types.ts` | create | Payload shapes: `CfdDay`, `TimePoint`, `TimeStats`, `AgingItem`, `ThroughputWeek`, `FlowReport`, `FlowParams`. |
| `client/src/features/flow/api.ts` | create | `flowApi.report(slug, params)`. |
| `client/src/features/flow/hooks/useFlowReport.ts` | create | Loads for the current filters; loading/error keyed to the filter set. |
| `client/src/features/flow/lib/flow.ts` | create | Presets, `rangeFor`, `STACK_ORDER`, `axisScale`, `cfdMax`, `stackBands`, `areaPath`, `labelIndexes`, `agingLevel`, `countOverP85`, `isEmptyReport`, `describeCfd`, `describeStats`. |
| `client/src/features/flow/components/CumulativeFlowChart.tsx` | create | Stacked cumulative flow chart with an active-index crosshair. |
| `client/src/features/flow/components/TimeScatterChart.tsx` | create | Cycle or lead time scatter with the percentile lines. |
| `client/src/features/flow/components/ThroughputChart.tsx` | create | Bars per ISO week. |
| `client/src/features/flow/components/AgingWipList.tsx` | create | Ageing items with age, assignees and level. |
| `client/src/features/flow/components/FlowReportPanel.tsx` | create | Filters, summary cards, cycle/lead switch, charts and list. |
| `client/src/pages/ReportsPage.tsx` | modify | Adds the Flow tab (`?tab=flow`) behind `projects:read`. |

**Referenced requirements:** FR-001 … FR-008, NFR-001 … NFR-004.

## Data model

| Entity | Action | Fields (action) |
|---|---|---|
| StatusTransition | no_change | `workspace`, `task`, `project` (name at the time, ≤60), `sprint` (nullable), `type`, `from` (nullable), `to`, `at`, `actor` (nullable) — all no_change |
| Task | no_change | `status`, `createdAt`, `updatedAt`, `completedAt` (nullable), `project`, `number` (nullable), `parent` (nullable), `assignees` — all no_change |
| Project | no_change | `name` (join key with `task.project`), `key` (task key prefix, `TM` fallback) |
| User | no_change | `name`, `avatarUrl` (`PUBLIC_USER_FIELDS`) |

**Flow.** A status change is recorded as activity, which the flow listener turns into one `StatusTransition` row with
the `from`/`to` statuses, the project name and the sprint as they were at that moment. On request, the handler loads
the top-level non-epic tasks of the workspace (narrowed by project name or sprint id when filtered) plus the
transitions up to `range.end`, and the pure module rebuilds each task's ordered steps, backfilling from `createdAt`,
from the first transition's `from`, or from the task's last update when the log does not end with the current status.
Cumulative flow counts the steps per day, cycle and lead time measure the tasks whose completion falls in the range,
throughput counts those completions per ISO week, and aging WIP lists the tasks whose current status is in progress
with the days since they entered it.

## API contracts

| Method | Path | Action | Auth | Requirements |
|---|---|---|---|---|
| GET | `/api/workspaces/:slug/reports/flow` | create | yes | FR-001 … FR-007, NFR-001, NFR-002, NFR-004 |

Query parameters: `project` (name, ≤60), `sprint` (24-hex id), `from` and `to` (`YYYY-MM-DD`, default: the last 30
days ending today, at most 180 days). Permission area/action: `projects:read`.

## Security considerations

- **NFR-001 — workspace isolation (CON-106).** Every query carries `workspace: req.workspace._id`; the project and
  sprint filters narrow inside the workspace only.
- **NFR-002 — authentication and authorisation (CON-511, CON-512).** `protect` resolves the JWT and the database
  session, then `requirePermission('projects:read')` attaches `req.workspace`/`req.permissions`. Only
  `PUBLIC_USER_FIELDS` are selected for the aging list, so no email or account detail reaches the report.
- **NFR-004 — input validation (CON-515, CON-516).** Values are checked as single strings, the sprint id is
  pattern-checked and cast with `mongoose.Types.ObjectId`, and the range is capped before any query runs.

## Performance considerations

- **NFR-004.** One task query with an explicit field selection, one transition query bounded by `at <= range.end`
  (restricted to the ids in scope when filtered), one user query for the aging assignees only, and then in-memory
  passes over those arrays.
- **NFR-003.** The pure module can be reused by any caller that already holds tasks and transitions, and it is tested
  without a database (CON-407).

## Dependencies

| Name | Type | Action | Notes |
|---|---|---|---|
| mongoose | library | no_change | StatusTransition rows, task filtering, ObjectId casting for the sprint filter. |
| `server/src/utils/activity.ts` | internal | no_change | The stream the tracking listener consumes. |
| `server/src/utils/workflow.ts` | internal | no_change | CON-108: board stages map onto the canonical statuses. |
| `client/src/utils/api.ts` | internal | no_change | CON-207: shared axios instance for errors and the 401 redirect. |
| `client/src/features/projects` | internal | no_change | `useProjects` supplies the filter options. |

## Risks

| Risk | Mitigation |
|---|---|
| Missing transitions produce incomplete timelines. | Tracking is registered at application start and `buildTimelines` backfills from creation, the first transition's `from` and the last update. |
| A busy 180-day range loads many transitions. | Range cap plus narrowing transitions to the tasks in scope when a filter is set. |
| A small sample makes p85 look authoritative. | `TimeStats` carries the count and the panel prints it (or says nothing has finished yet). |

## Verification

The suites are listed under *Verification (retroactive)* in the spec (TEST-001 … TEST-005): `pnpm --filter server
test` for the pure metrics, `pnpm --filter server test:integration` against a local MongoDB for the endpoint and
its permissions, and `pnpm --filter client test` for the helpers and the panel. Full gate: `pnpm --filter server
typecheck && pnpm --filter server test`, `pnpm --filter client typecheck && pnpm --filter client test &&
pnpm --filter client lint`, `pnpm --filter client build` (CON-402).
