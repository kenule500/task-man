# Execution tasks — flow reports

> **Retroactive task list** — every task below is already implemented and merged; the list records the work that
> produced the behaviour in `.sdrive/specs/ongoing/flow-reports/v1/spec.md` (onboarded 2026-10-16). Not authored upfront.

- **Feature:** `flow-reports` · **Version:** 1
- **Governance:** `.sdrive/governance/flow-reports/v1/tasks.json`
- All tasks are `completed: true`; the checkbox state mirrors `tasks.json`.

## P1 — Transition history

- [x] **T1.1 StatusTransition model and indexes** — `server/src/models/statusTransitionModel.ts`: one row per move with workspace, task, project name, sprint, type, `from`, `to`, `at` and actor, indexed by `{ workspace, at }` and `{ workspace, task, at }`, kept without a TTL. → FR-003, NFR-001 (AC-005)
- [x] **T1.2 Flow tracking listener on the activity stream** — `server/src/utils/flow/register.ts` (`registerFlowTracking`, `trackStatusTransition`) with the call added to `server/src/app.ts` before the automation and webhook listeners. → FR-003, NFR-001 (AC-005, AC-006)

## P2 — Pure metrics core *(depends on P1)*

- [x] **T2.1 Metrics module with timelines and the four measures** — `server/src/utils/flow/metrics.ts`: `dayKey`, `parseDayKey`, `makeRange`, `buildTimelines` with its backfill rules, `cumulativeFlow`, `percentile` (nearest rank), `cycleTimes`, `leadTimes`, `agingWip`, `isoWeekLabel`, `throughput` and `buildFlowReport`. → FR-004, FR-005, FR-006, FR-007, NFR-003 (AC-005, AC-006, AC-007, AC-008)
- [x] **T2.2 Unit tests for the metrics module** — `server/src/__tests__/flowMetrics.test.ts` covering day keys and ranges, the timeline backfill, the cumulative counts, the percentiles, cycle versus lead time, throughput weeks and the aging order. → NFR-003 (AC-005, AC-006, AC-007)

## P3 — HTTP surface *(depends on P2)*

- [x] **T3.1 getFlowReport handler with strict query parsing** — `server/src/controllers/flowController.ts`: rejection of array/object query values, the project/sprint/date rules, the 180-day cap, the default 30-day range, the workspace-scoped task and transition queries, the assignee lookup for the aging list and the JSON payload. → FR-001, FR-002, FR-007, NFR-001, NFR-004 (AC-001, AC-002, AC-003, AC-004, AC-008)
- [x] **T3.2 Route registration with the project permission** — `GET /:slug/reports/flow` on `server/src/routes/workspaceRoutes.ts` behind `protect` and `requirePermission('projects:read')`. → FR-001, NFR-002 (AC-001)

## P4 — Flow report UI *(depends on P1, P3)*

- [x] **T4.1 Client flow API, types and loading hook** — `client/src/features/flow/types.ts`, `api.ts` and `hooks/useFlowReport.ts`. → FR-001, FR-008 (AC-001, AC-009)
- [x] **T4.2 Presentation helpers with text alternatives** — `client/src/features/flow/lib/flow.ts` (range presets, axis, stacking, ageing levels, empty detection, text alternatives) plus `hooks/useActiveIndex.ts` and `hooks/useChartWidth.ts`. → FR-008, NFR-003 (AC-009, AC-010)
- [x] **T4.3 The four flow charts and the panel** — `CumulativeFlowChart.tsx`, `TimeScatterChart.tsx`, `ThroughputChart.tsx`, `AgingWipList.tsx`, `ChartParts.tsx` and `FlowReportPanel.tsx` with the filters, summary cards and the cycle/lead switch. → FR-004, FR-005, FR-006, FR-007, FR-008 (AC-005, AC-006, AC-007, AC-008)
- [x] **T4.4 Flow tab on the Reports page** — `client/src/pages/ReportsPage.tsx` mounts `FlowReportPanel` as `?tab=flow`, only when the role holds `projects:read`. → FR-008, NFR-002 (AC-003)
- [x] **T4.5 Client tests for the helpers and the panel** — `client/src/features/flow/__tests__/flow.test.ts` and `FlowReportPanel.test.tsx` with the shared fixtures. → FR-008, NFR-003 (AC-009, AC-010)

## How this was verified (retroactive)

- `pnpm --filter server test` — TEST-001.
- `pnpm --filter server test:integration` against a local MongoDB — TEST-002, TEST-005.
- `pnpm --filter client test` — TEST-003, TEST-004.
- Browser check: `/{workspace}/reports?tab=flow` with every range preset, a project filter and a sprint filter,
  including empty, loading and error states (CON-703).
