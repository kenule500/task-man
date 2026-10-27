# Flow reports: cumulative flow, cycle and lead time, throughput and aging work in progress

> **Retroactive specification** — documents behaviour that already exists in the codebase (onboarded 2026-10-16). Not authored upfront.

- **Feature:** `flow-reports`
- **Version:** 1
- **Governance:** `.sdrive/governance/flow-reports/v1/spec.json`
- **Status:** complete — every requirement below is implemented and covered by tests

## Overview

**Problem.** A board shows the state of the work now but says nothing about how work moves: how long a task takes
from start to done, what is piling up in a column, how many items the team finishes per week, and which items have
been in progress far longer than usual. Without those figures a team cannot tell whether a process change helped,
and cannot see a stuck item before it becomes a late delivery.

**Solution.** Every status move is recorded once as a `StatusTransition` row by the flow tracking listener
(`server/src/utils/flow/register.ts`, registered in `server/src/app.ts`). `GET
/api/workspaces/:slug/reports/flow` rebuilds the whole report from those rows plus the tasks
(`server/src/controllers/flowController.ts`, `server/src/utils/flow/metrics.ts`): a cumulative flow diagram day by
day, cycle time (first entry into in-progress to completion) and lead time (creation to completion) with
p50/p85/p95, completions per ISO week, and the items still in progress ordered by age against the 85th percentile.
The client (`client/src/features/flow`) renders it as the Flow tab of the Reports page, with text alternatives for
every chart.

**Target audience.** Scrum Masters, team leads and delivery managers reviewing how work flows through the board, and
process improvers looking for a bottleneck.

### Assumptions

1. *assumption: true* — flow metrics are rebuilt from recorded transitions, so history starts when flow tracking
   started recording; earlier work only has its creation date and current status.
2. *assumption: true* — days are UTC calendar days: the server slices ISO strings for day keys and the client builds
   its range from the same UTC keys, so the report is not aligned to the viewer's local midnight.
3. *assumption: true* — cycle time runs from the **first** entry into in-progress, so a task that went straight from
   pending to completed has no cycle time at all.
4. *assumption: true* — transitions are recorded only for top-level, non-epic tasks; subtasks and epics are outside
   the flow metrics.

### Out of scope

- Forecasting or Monte Carlo simulation on top of the percentiles.
- Per-person flow metrics; cycle and lead time are reported for the whole scope.
- Backfilling transitions for tasks that moved before flow tracking existed.
- Server-side chart images or scheduled report delivery.

## User stories

### US-001 — Read flow metrics for a period
As a **Scrum Master** I want **a report for a date range that defaults to the last 30 days** so that **I can review
how work flowed without building anything myself**.

- **AC-001** Without date parameters the report covers the last 30 days ending today and answers with the range it
  used (`from`, `to`, `days`). (`getFlowReport`, `DEFAULT_RANGE_DAYS`)
- **AC-002** Dates that are not real calendar days written as `YYYY-MM-DD`, a start after the end, or a range longer
  than 180 days are refused with HTTP 400 and a message naming the problem. (`parseFlowQuery`, `MAX_FLOW_RANGE_DAYS`)

### US-002 — Narrow the report to a project or a sprint
As a **Scrum Master** I want **to filter the metrics by project or sprint** so that **I can look at one team's flow**.

- **AC-003** A project filter (name, at most 60 characters) or a sprint filter (24-hexadecimal id) limits both the
  tasks measured and the transitions read.
- **AC-004** A query value that is not a single string, such as an array or nested object, is refused with HTTP 400
  "Invalid `<name>`" rather than being cast. (`queryString`)

### US-003 — See where work is piling up
As a **Scrum Master** I want **a cumulative flow diagram of the range** so that **a widening band shows me the
bottleneck**.

- **AC-005** For every day of the range the report returns how many tasks were pending, in progress and completed at
  the end of that day; the chart stacks them with completed at the base and pending on top. (`cumulativeFlow`,
  `STACK_ORDER`)

### US-004 — Compare cycle time and lead time
As a **Scrum Master** I want **median, 85th and 95th percentile times to finish** so that **I can promise dates with
a figure**.

- **AC-006** Cycle time (first step in in-progress to the last completion) and lead time (creation or first recorded
  step, whichever is earlier, to that completion) are computed for the tasks that finished inside the range, each
  with count, average and p50/p85/p95 in days, or null values when nothing finished. (`cycleTimes`, `leadTimes`,
  `percentile`, `summarize`)

### US-005 — Check throughput and spot ageing work
As a **team lead** I want **completions per week and the items still in progress by age** so that **I can see
whether the team is speeding up and which item needs attention today**.

- **AC-007** Throughput is reported per ISO week of the range with the week label (e.g. `2026-W41`), the Monday that
  starts it and the number of tasks completed in it, including weeks with no completion. (`throughput`,
  `isoWeekLabel`)
- **AC-008** Ageing work in progress lists every task still in progress, oldest first, with the days since it entered
  in progress and the assignees on it. (`agingWip`, `PUBLIC_USER_FIELDS`)
- **AC-009** A range with no tasks shows an explicit empty state instead of blank charts, and a range with no
  completed task says so in the chart's text alternative. (`isEmptyReport`, `describeStats`)
- **AC-010** Each item in progress is classed against the p85 of cycle time as On track, Watch (over half of it), Over
  p85 or No baseline, and the summary shows how many are over p85. (`agingLevel`, `AGING_META`, `countOverP85`)

## Functional requirements

| ID | Requirement | Acceptance criteria |
|---|---|---|
| FR-001 | `GET /api/workspaces/:slug/reports/flow` returns `range`, the canonical statuses, `cfd` (per UTC day: pending, inProgress, completed), `cycleTime` and `leadTime` (`count`, `average`, `p50`, `p85`, `p95`, points), `aging` (task, key, title, project, assignees, since, days) and `throughput` (ISO week, Monday, count). (`flowController.ts`) | AC-001, AC-005 |
| FR-002 | The query is parsed strictly: project is one string of at most 60 characters, sprint must match `/^[a-f0-9]{24}$/i`, `from`/`to` must be real day keys, `from` must not be after `to`, the range may span at most 180 days, and every rejected value produces 400 with a message instead of a cast. | AC-001, AC-002, AC-004 |
| FR-003 | `registerFlowTracking` subscribes once per process to the activity stream and `trackStatusTransition` writes a `StatusTransition` row (workspace, task, project name, sprint, type, from, to, at, actor) for `task.created` and status-changing `task.updated` of top-level non-epic tasks; the report reads the transitions of the range and, when filtered, only those of the tasks in scope. | AC-003, AC-005, AC-006 |
| FR-004 | `buildTimelines` rebuilds each task's ordered steps, backfilling from `createdAt` (no transitions), from the first transition's `from`, and from the task's last update when the log does not end with the current status; `cumulativeFlow` then emits one day entry per day of the range. | AC-005 |
| FR-005 | `cycleTimes`/`leadTimes` keep only tasks whose last completion falls inside the range and return `count`, `average` and the p50/p85/p95 percentiles from `percentile()` (nearest rank), with null figures for an empty list. | AC-006 |
| FR-006 | `throughput` groups the completions of the range into ISO weeks (`isoWeekLabel`, e.g. `2026-W41`) with the Monday that starts each week and its count, including weeks with no completion. | AC-007 |
| FR-007 | `agingWip` returns the tasks still in progress, oldest first, with the moment they entered in progress and the days elapsed; the controller resolves only those assignees and returns `name` and `avatarUrl` from `PUBLIC_USER_FIELDS`. | AC-008 |
| FR-008 | The client module offers range presets 14/30/90/180 days (30 default), project and sprint selects, the charts `CumulativeFlowChart`, `TimeScatterChart`, `ThroughputChart` and `AgingWipList`, the helpers in `lib/flow.ts` (axis, stacking, ageing levels, empty detection, text alternatives) and is mounted as the Flow tab of the Reports page (`?tab=flow`) only when the role holds `projects:read`. | AC-003, AC-009, AC-010 |

## Non-functional requirements

| ID | Requirement |
|---|---|
| NFR-001 | The whole report is scoped to one workspace (CON-106): the task query, project key lookup, transition query and assignee lookup all carry `workspace: req.workspace._id`. |
| NFR-002 | The endpoint runs behind `protect` and `requirePermission('projects:read')` (CON-512) on `server/src/routes/workspaceRoutes.ts`. |
| NFR-003 | All metric arithmetic lives in the pure, dependency-free `server/src/utils/flow/metrics.ts` with a Jest unit test (CON-109, CON-202, CON-407), and the client presentation helpers in `client/src/features/flow/lib/flow.ts` have their own test. |
| NFR-004 | The report is bounded: 180-day cap, explicit field selections, transitions limited to `at <= range.end` (and to the tasks in scope when filtered), and assignee profiles fetched only for the aging list. |

Non-functional requirements carry no acceptance criteria of their own: they are enforced by the constitution rules
above and verified by the suites listed in *Verification*.

## Edge cases

| ID | Situation | Expected behaviour |
|---|---|---|
| EC-001 | A range longer than 180 days is requested. | HTTP 400 "The date range can span at most 180 days"; the client only offers 14/30/90/180 presets. |
| EC-002 | `from` is later than `to`. | HTTP 400 "The start date must not be after the end date". |
| EC-003 | A date that is not a real calendar day, e.g. `2026-02-31`. | HTTP 400 "Dates must be real days written as YYYY-MM-DD"; `parseDayKey` requires the parsed day to round-trip to the same key. |
| EC-004 | A filter value is not a plain string, e.g. `?from[]=2026-01-01` or `?sprint=abc`. | HTTP 400 "Invalid from" / "Invalid sprint"; `queryString` rejects arrays and objects and the sprint pattern is checked before an ObjectId is built. |
| EC-005 | Nothing was completed in the range. | `count` 0 with null figures, the scatter plot says "no completed tasks in this range", and a range with no tasks at all shows the empty state (`isEmptyReport`). |
| EC-006 | There is no p85 baseline to judge ageing work with. | `agingLevel` is `unknown` and the item is tagged "No baseline"; the over-p85 count stays 0 instead of flagging everything. |
| EC-007 | Subtasks, epics or tasks without a number are in scope. | Subtasks and epics are excluded from the task query (`parent: null`, `type: { $ne: 'epic' }`) so work is not counted twice; a task without a number gets an empty key and the key lookup falls back to the prefix `TM` when the project has no key. |

## Dependencies

| Name | Type | Notes |
|---|---|---|
| `server/src/utils/activity.ts` | internal | `onActivity`/`RecordedActivity` is the stream the flow listener consumes. |
| `server/src/models/statusTransitionModel.ts` | internal | The rows the report replays, indexed by `{ workspace, at }` and `{ workspace, task, at }`. |
| `client/src/features/tasks` | internal | Statuses and task types mirrored by the client types; `lib/date` for calendar-day helpers. |
| `client/src/features/projects` | internal | `useProjects` supplies the project and sprint options of the filters. |
| `server/src/utils/workflow.ts` | internal | CON-108: custom board columns map onto the canonical statuses the metrics measure. |

## Risks

| ID | Risk | Mitigation |
|---|---|---|
| RISK-001 | Flow figures depend on recorded transitions; a process that does not register tracking has missing history. | `registerFlowTracking` runs at application start, and the report degrades gracefully (creation date and current status remain available). |
| RISK-002 | A long range over a busy workspace loads many transitions. | 180-day cap plus restricting transitions to the task ids in scope when a project or sprint filter is set. |
| RISK-003 | Percentiles on a small sample can be read as a commitment. | Every `TimeStats` carries its count and the UI says how many tasks were measured, or that none have finished yet. |

## Verification (retroactive)

| Test id | File | Command |
|---|---|---|
| TEST-001 | `server/src/__tests__/flowMetrics.test.ts` | `pnpm --filter server test` |
| TEST-002 | `server/src/__integration__/flow.test.ts` | `pnpm --filter server test:integration` |
| TEST-003 | `client/src/features/flow/__tests__/flow.test.ts` | `pnpm --filter client test` |
| TEST-004 | `client/src/features/flow/__tests__/FlowReportPanel.test.tsx` | `pnpm --filter client test` |
| TEST-005 | `server/src/__integration__/rbac.test.ts` | `pnpm --filter server test:integration` |

Integration tests need a local MongoDB (`MONGO_URI=mongodb://127.0.0.1:27017/task-man`, CON-407). Full gate:
`pnpm --filter server typecheck && pnpm --filter server test`, `pnpm --filter client typecheck && pnpm --filter
client test && pnpm --filter client lint`, `pnpm --filter client build` (CON-402). Browser check: the Flow tab at
`/{workspace}/reports?tab=flow` with each range preset, a project filter and a sprint filter (empty, loading and
error states; keyboard; narrow screens — CON-703).
