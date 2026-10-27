# Execution tasks — scrum planning

> **Retroactive task list** — every task below is already implemented and merged; the list records the work that
> produced the behaviour in `.sdrive/specs/ongoing/scrum-planning/v1/spec.md` (onboarded 2026-10-16). Not authored upfront.

- **Feature:** `scrum-planning` · **Version:** 1
- **Governance:** `.sdrive/governance/scrum-planning/v1/tasks.json`
- All tasks are `completed: true`; the checkbox state mirrors `tasks.json`.

## P1 — Data model and routing

- [x] **T1.1 Project and Sprint Mongoose models** — `server/src/models/projectModel.ts`, `server/src/models/sprintModel.ts`: workspace scope, `nameKey` unique per workspace, `key` from `projectKeyFrom`, sprint status enum, `startedAt`/`completedAt`/`completedPoints`, `{ workspace, project, startDate }` index. → FR-001, FR-002, NFR-001 (AC-001, AC-004)
- [x] **T1.2 Permission-scoped project and sprint router** — `server/src/routes/projectRoutes.ts` mounted at `/api/workspaces/:slug/projects` with `protect` plus one `requirePermission` per route; the read-only sprint report route added to `server/src/routes/workspaceRoutes.ts`. → FR-002, FR-003, FR-007, NFR-002 (AC-003, AC-010)

## P2 — Backlog and sprint lifecycle *(depends on P1)*

- [x] **T2.1 Project CRUD with task sync and rename cascade** — `listProjects`, `createProject`, `updateProject`, `deleteProject` in `server/src/controllers/projectController.ts`, including `syncProjectsFromTasks`, the case-insensitive cascade to tasks, wiki pages and custom fields, and the unassigning delete. → FR-001, NFR-001 (AC-004)
- [x] **T2.2 Sprint create, update, start and complete handlers** — `validateCreateSprint`/`validateUpdateSprint`/`validateCompleteSprint`, `assertSprintDates`, `startSprint` with the one-active-sprint rule, `completeSprint` computing `completedPoints` and moving the unfinished work with a recorded `sprint` change per task. → FR-002, FR-003, FR-004, FR-005 (AC-001, AC-002, AC-003, AC-005, AC-006)
- [x] **T2.3 Task-to-sprint assignment rules** — `findOpenSprint` and `reconcileSprint` in `server/src/controllers/taskController.ts`: the sprint must belong to the workspace and not be completed, the task takes the sprint's project, and a project change clears the sprint; epics are refused. → FR-006, NFR-001 (AC-007)
- [x] **T2.4 Sprints and Backlog tabs on the project page** — `ProjectWorkspace.tsx` with the six tabs, sprint cards grouped by active/planned/completed, the move-to-sprint select, the sprint form dialog, the complete-sprint dialog and the counter that remounts the task part after a sprint change. → FR-004, FR-005, FR-006 (AC-004, AC-005, AC-006, AC-007)

## P3 — Sprint reporting *(depends on P2)*

- [x] **T3.1 Sprint report rebuilt from the activity log** — `classifySprintScope` and `getSprintReport` in `server/src/controllers/reportController.ts`: replay the sprint changes, mark carry-overs, and return the committed/added/removed/completed/notCompleted buckets with count and point totals. → FR-007, NFR-001 (AC-010, AC-011)
- [x] **T3.2 Burndown and velocity helpers with charts** — `client/src/features/projects/lib/burndown.ts` and `lib/velocity.ts` plus `BurndownChart` and `VelocityChart`, including the points-or-tasks unit and the ideal line. → FR-008, FR-009, NFR-003 (AC-008, AC-009)
- [x] **T3.3 Sprint report page** — `client/src/pages/SprintReportPage.tsx` with the five summary cards, the burndown built from `scopeTasksOf(report)`, the delivered percentage and the bucket tables. → FR-007, FR-008 (AC-008, AC-010, AC-011)

## P4 — Planning views *(depends on P1, P2)*

- [x] **T4.1 Roadmap helpers** — `client/src/features/planning/lib/roadmap.ts`: `buildRoadmap` grouping epics per active project, health and rolled-up spans, `buildAxis` with month/week ticks, `placeSpan`, `sprintBands`, `releaseMarkers` and the `describe*` text alternatives. → FR-010, NFR-004 (AC-012, AC-013)
- [x] **T4.2 Roadmap page with zoom, filters and epic list** — `client/src/pages/RoadmapPage.tsx` with the project filter, month/week segmentation, the measured timeline width feeding the axis, the legend, the desktop timeline and the narrow-screen list. → FR-010 (AC-013)
- [x] **T4.3 Workload aggregation and capacity storage** — `client/src/features/planning/lib/workload.ts` and `lib/capacity.ts` (stored under `taskman.workload.capacity.<slug>`). → FR-011, NFR-003 (AC-014, AC-015, AC-016, AC-017)
- [x] **T4.4 Workload page with scope switch and capacity control** — `client/src/pages/WorkloadPage.tsx`: sprint or date-range scope, project and sprint selects, the capacity input with its validation message, and `WorkloadList` rows with the capacity bar and their tasks. → FR-011 (AC-014, AC-015, AC-017)
- [x] **T4.5 Unit tests for the planning helpers** — Jest suites for capacity, roadmap, workload, sprintReport, burndown and sprintStats, plus the navigation and report-link tests. → FR-008, FR-009, FR-010, FR-011, NFR-003 (AC-008, AC-009, AC-012, AC-014, AC-015, AC-016, AC-017)

## How this was verified (retroactive)

- `pnpm --filter client test` — TEST-003 … TEST-010.
- `pnpm --filter server test` — server unit suites (`workflow.test.ts`, flow metrics) plus the typecheck gate.
- `pnpm --filter server test:integration` against a local MongoDB — TEST-001, TEST-002, TEST-011, TEST-012.
- Browser check: `/{workspace}/projects`, `/{workspace}/projects/:projectId` (Sprints and Backlog tabs),
  `/{workspace}/projects/:projectId/sprints/:sprintId/report`, `/{workspace}/roadmap`, `/{workspace}/workload`
  (empty, loading and error states; keyboard; narrow screens — CON-703).
