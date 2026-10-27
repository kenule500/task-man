# Scrum planning: projects, sprints, backlog, roadmap, workload and sprint reports

> **Retroactive specification** — documents behaviour that already exists in the codebase (onboarded 2026-10-16). Not authored upfront.

- **Feature:** `scrum-planning`
- **Version:** 1
- **Governance:** `.sdrive/governance/scrum-planning/v1/spec.json`
- **Status:** complete — every requirement below is implemented and covered by tests

## Overview

**Problem.** A team that works in sprints needs one place to keep the backlog, plan and run a sprint, see whether
the sprint is on track, review what was committed versus delivered, and look at several sprints at once. TaskMan
already had tasks, board/calendar/timeline views and a workflow, but no project/sprint container and no scrum
reporting on top of it.

**Solution.** Projects (`server/src/models/projectModel.ts`) and Sprints
(`server/src/models/sprintModel.ts`) are workspace-scoped Mongoose documents behind the permission-guarded router
`server/src/routes/projectRoutes.ts`. The project page
(`client/src/features/projects/components/ProjectWorkspace.tsx`) holds the Sprints, Backlog, Epics, Releases, Wiki
and Overview tabs. Reporting reuses existing data: the sprint report
(`server/src/controllers/reportController.ts`) rebuilds sprint scope from the recorded sprint moves in the activity
log, while burndown, velocity, roadmap and workload are pure client helpers in `lib/` folders.

**Target audience.** Scrum Masters, product owners and delivery teams working in sprints inside a TaskMan
workspace, plus engineering managers who read velocity, roadmap and workload views.

### Assumptions

1. *assumption: true* — the codebase has no working-day calendar, so sprint dates are consecutive calendar days and
   weekends are included in the burndown span, the velocity order and the roadmap axis.
2. *assumption: true* — velocity, burndown and workload read `task.storyPoints` only; the time-tracking estimate
   (`task.estimateMinutes`) is not used by these views, so a team that estimates in hours sees item counts.
3. *assumption: true* — a task points at its project by name (`task.project` is text) while sprints are linked by
   ObjectId (`task.sprint`), so the project name is the join key between tasks and projects in every planning view.
4. *assumption: true* — planning is a workspace-level capability with no per-project membership, so any role holding
   `projects:write` can plan and run sprints in every project of the workspace.

### Out of scope

- Capacity planning per person per sprint; the workload view compares committed points against one capacity number
  per person kept in the browser.
- Cross-project sprint planning and a programme-level backlog.
- Editing past sprint history or correcting the activity log retroactively.
- Automatic sprint roll-over on a schedule; starting and completing a sprint is always explicit.

## User stories

### US-001 — Plan and start a sprint in a project
As a **Scrum Master** I want to **create a sprint with a name, a goal and dates and start it when the team is
ready** so that **the team works against one agreed sprint window**.

- **AC-001** A sprint is created in a project with a name and start and end dates; the goal is optional, stored, and
  shown on the sprint card and on the sprint report. (`validateCreateSprint`, `SprintFormDialog.tsx`)
- **AC-002** A sprint whose end date is before its start date is refused with HTTP 400 and the message "The sprint
  must end on or after its start date". (`assertSprintDates`)
- **AC-003** Starting a planned sprint sets its status to `active` and stamps `startedAt`; if the project already has
  an active sprint the request is refused with HTTP 409 "Complete the active sprint of this project first."

### US-002 — Keep a backlog and plan work into a sprint
As a **team member** I want to **see the project's unplanned work in a backlog and move the right items into a
sprint** so that **the sprint contains only what the team agreed to pull in**.

- **AC-004** The project page shows Sprints, Backlog, Epics, Releases, Wiki and Overview tabs, and the Backlog tab
  lists the project's tasks that have no sprint. (`TABS` in `ProjectWorkspace.tsx`, `groupProjectTasks`)
- **AC-005** Completing the active sprint moves every unfinished task either to the backlog (default) or to a planned
  sprint of the same project that the caller selected. (`completeSprint`, `CompleteSprintDialog.tsx`)
- **AC-006** Deleting a sprint returns its tasks to the backlog and deletes no task. (`deleteSprint`)
- **AC-007** A task is planned into a sprint by setting its `sprint` field through the task endpoints; the sprint must
  belong to the same workspace and must not be completed, the task takes the sprint's project, and changing a task's
  project clears its sprint. (`findOpenSprint`, `reconcileSprint`)

### US-003 — See whether the running sprint is on track
As a **Scrum Master** I want to **see a burndown of the remaining work and the velocity of previous sprints** so that
**I can tell early that a sprint is behind**.

- **AC-008** The burndown shows remaining work at the end of each day from the sprint start to its end date, measured
  in story points when any top-level item is estimated and otherwise in task counts, against an ideal straight line,
  with no remaining value for days that have not happened yet. (`buildBurndown`)
- **AC-009** Velocity lists completed sprints oldest first with the points each delivered, and reports the average of
  the last three as a number, or `null` before the first completed sprint. (`sprintVelocities`, `averageVelocity`)

### US-004 — Review what a sprint committed and delivered
As a **Scrum Master** I want to **separate committed work, work added after the start, work removed and work carried
over** so that **the retrospective can discuss scope change with numbers**.

- **AC-010** The sprint report returns the committed, completed, notCompleted, added and removed buckets with their
  items and a summary of counts and story points. (`getSprintReport`)
- **AC-011** A task first moved into the sprint after it was started counts as added and not as committed; a task
  moved out when the sprint was completed counts as not completed rather than removed; a task finished after the
  sprint was closed is not counted as delivered. (`classifySprintScope`)

### US-005 — Look at several sprints and epics at once on the roadmap
As a **product owner** I want to **see epics over time with the sprint windows and release milestones** so that **I
can see which epics land in which sprint window**.

- **AC-012** The roadmap lists epics per active project with the earliest start and latest end over the epic and its
  items, a percent complete and a health of done, overdue, in-progress or upcoming. (`buildRoadmap`, `healthOf`)
- **AC-013** The roadmap draws a month or week axis with sprint bands and, for one selected project, milestone markers
  for its dated non-archived releases; every epic row and marker has a text alternative. (`buildAxis`, `sprintBands`,
  `releaseMarkers`, `describeEpic`)

### US-006 — Balance a sprint or a date range across the team
As a **Scrum Master** I want to **see story points and item counts per assignee against a capacity I can set** so
that **I can spot who is overloaded before the sprint starts**.

- **AC-014** The workload view aggregates story points and item counts per assignee for a sprint or a date range,
  optionally limited to one project. (`tasksInScope`, `aggregateWorkload`)
- **AC-015** A capacity between 1 and 200 points is kept per workspace in the browser and reused on the next visit; a
  person above it is marked over capacity with the surplus and a whole-percent usage. (`capacity.ts`, `buildRow`)
- **AC-016** Tasks without assignees are grouped under Unassigned; a task with several assignees counts for each of
  them while the scope totals count it once. (`UNASSIGNED_ID`, `itemCount`)
- **AC-017** Each capacity bar exposes a text alternative such as "13 of 10 points, 4 items, over capacity by 3."
  (`describeLoad`)

## Functional requirements

| ID | Requirement | Acceptance criteria |
|---|---|---|
| FR-001 | Projects are workspace-scoped containers: trimmed names of at most 60 characters, the unique index `{ workspace, nameKey }`, a `key` generated by `projectKeyFrom` when absent (matching `/^[A-Z0-9]{2,6}$/`), and `syncProjectsFromTasks` creating a project for every `task.project` name that has none. (`server/src/models/projectModel.ts`, `projectController.ts`) | AC-004 |
| FR-002 | A sprint requires a name, an ISO-8601 `startDate` and an ISO-8601 `endDate`; `assertSprintDates` refuses an end before the start with 400. Names are limited to 60 and goals to 300 characters. | AC-001, AC-002 |
| FR-003 | Only a `planned` sprint can be started, a project can have at most one `active` sprint, and start/complete use a conditional `findOneAndUpdate` so a losing duplicate request gets 409 instead of changing state twice. | AC-003 |
| FR-004 | `completeSprint` stores `completedAt` and `completedPoints` (story points of the completed top-level tasks), moves the unfinished tasks to the backlog or a planned sprint of the same project, and records a `sprint` change per carried-over task. It responds with `{ sprint, movedTasks }`. | AC-005 |
| FR-005 | `deleteSprint` clears `sprint` on its tasks, records the change per task and then removes the sprint; no task is deleted. | AC-006 |
| FR-006 | A task joins a sprint through `POST`/`PATCH`/`PUT` on the task endpoints; `findOpenSprint` requires the sprint to be in the workspace and not completed, `reconcileSprint` sets the task's project to the sprint's project, and a project change clears the sprint. Epics cannot be planned into a sprint. | AC-007 |
| FR-007 | `GET /api/workspaces/:slug/projects/:projectId/sprints/:sprintId/report` returns the sprint metadata and the committed, completed, notCompleted, added and removed buckets with count and point summaries, rebuilding membership from the activity log and treating the moves logged at completion as carry-over. | AC-010, AC-011 |
| FR-008 | `buildBurndown` uses story points when any top-level task of the sprint is estimated and otherwise one per task, returning the remaining work per day (at most 120 days) with an ideal line and `null` after the last known day. | AC-008 |
| FR-009 | `sprintVelocities` lists completed sprints ordered by `completedAt`/`endDate` with their `completedPoints`; `averageVelocity` means the last three, rounded to one decimal, or `null`. | AC-009 |
| FR-010 | `buildRoadmap` groups epics of non-archived projects with rolled-up spans, percent and health; `buildAxis`, `placeSpan`, `sprintBands` and `releaseMarkers` lay epics, sprint bands and release milestones on a month or week axis, with `describeEpic`/`describeReleaseMarker` text alternatives. | AC-012, AC-013 |
| FR-011 | `tasksInScope`/`aggregateWorkload` group the top-level non-epic tasks of a sprint or date range per assignee with item and point totals, an unassigned bucket, unestimated counts, usage percent and surplus; `capacity.ts` stores the capacity per workspace under `taskman.workload.capacity.<slug>` and `describeLoad` produces the text alternative. | AC-014, AC-015, AC-016, AC-017 |

## Non-functional requirements

| ID | Requirement |
|---|---|
| NFR-001 | Every project, sprint, task and activity query filters by `req.workspace._id` (CON-106); `findProject`/`findSprint` scope by workspace, so a foreign id resolves to 404. |
| NFR-002 | Routes are permission scoped (CON-105, CON-512): `protect` then `requirePermission('projects:read' | 'projects:write' | 'projects:delete')`, with `projects:read` on the sprint report route; the client gates actions with `usePermissions`. |
| NFR-003 | Pure planning logic lives in `lib/` (client) or `utils/` (server) with a Jest test (CON-109, CON-202): capacity, roadmap, sprintReport, workload, burndown and sprintStats. |
| NFR-004 | Dates are calendar days (CON-203): `YYYY-MM-DD` values, read through `@/features/tasks/lib/date`, never `new Date('YYYY-MM-DD')`. |

Non-functional requirements carry no acceptance criteria of their own: they are enforced by the constitution rules
above and verified by the test suites listed in *Verification*.

## Edge cases

| ID | Situation | Expected behaviour |
|---|---|---|
| EC-001 | A project is created with a name another project of the workspace uses. | The unique index rejects it; the API answers 409 "A project with this name already exists". Concurrent syncs of task project names tolerate the duplicate key of the losing `bulkWrite`. |
| EC-002 | Two people start the same planned sprint at once. | Only one conditional update matches; the loser gets 409 "This sprint was changed by someone else" and the sprint has one `startedAt`. |
| EC-003 | A sprint was completed without ever being started. | Everything pointing at the sprint counts as committed and nothing as added, because there is no start time to compare against. |
| EC-004 | A sprint task is completed after the sprint was closed. | It is not counted as delivered: "completed" needs `completedAt` at or before the sprint's `completedAt`, so the task lands in `notCompleted`. |
| EC-005 | A project with tasks, sprints and wiki pages is deleted. | Tasks are kept but unassigned (`project` empty, `sprint` null), sprints are deleted, and the project's wiki pages and versions are removed. |
| EC-006 | An epic has no items or points. | `epicProgress` falls back to the epic's own dates, percent is computed on items, and `describeEpic` says "no items yet". |
| EC-007 | A sprint older than the activity retention window is reported. | Activity rows are removed by the 365-day TTL index (`ACTIVITY_RETENTION_DAYS`), so only tasks still pointing at the sprint are classified, using their creation date against `startedAt`. |

## Dependencies

| Name | Type | Notes |
|---|---|---|
| mongoose | library | Project/Sprint/Task documents; the unique `nameKey` index carries the duplicate-name rule. |
| express-validator | library | The validation chains declared on `projectRoutes.ts`. |
| `server/src/utils/activity.ts` | internal | `recordActivity`/`diffFields` produce the sprint entries and the sprint moves the report reads. |
| `client/src/features/tasks` | internal | `useTasks` (single source of truth) and `lib/date`. |
| `client/src/features/projects` | internal | `useProjects`, `BurndownChart`, `VelocityChart`, `sprintStats`. |

## Risks

| ID | Risk | Mitigation |
|---|---|---|
| RISK-001 | The report's committed/added/removed split depends on the activity stream. | All sprint moves go through controllers that call `recordActivity`; the fallback for missing history is documented (EC-007). |
| RISK-002 | Tasks reference projects by name, so a rename must cascade. | `updateProject` updates tasks, wiki pages and custom fields in one request with a case-insensitive collation. |
| RISK-003 | Burndown and workload fall back from points to items, so one sprint can look different in two views. | Both return a `unit` field and the components label the axis or sentence with it. |

## Verification (retroactive)

Legend — every test id used in `traceability.json`, with the real file and the command that runs it.

| Test id | File | Command |
|---|---|---|
| TEST-001 | `server/src/__integration__/projects.test.ts` | `pnpm --filter server test:integration` |
| TEST-002 | `server/src/__integration__/sprintReport.test.ts` | `pnpm --filter server test:integration` |
| TEST-003 | `client/src/features/projects/__tests__/burndown.test.ts` | `pnpm --filter client test` |
| TEST-004 | `client/src/features/projects/__tests__/sprintStats.test.ts` | `pnpm --filter client test` |
| TEST-005 | `client/src/features/planning/__tests__/roadmap.test.ts` | `pnpm --filter client test` |
| TEST-006 | `client/src/features/planning/__tests__/workload.test.ts` | `pnpm --filter client test` |
| TEST-007 | `client/src/features/planning/__tests__/capacity.test.ts` | `pnpm --filter client test` |
| TEST-008 | `client/src/features/planning/__tests__/sprintReport.test.ts` | `pnpm --filter client test` |
| TEST-009 | `client/src/features/planning/__tests__/SprintCardReportLink.test.tsx` | `pnpm --filter client test` |
| TEST-010 | `client/src/features/planning/__tests__/planningNavigation.test.ts` | `pnpm --filter client test` |
| TEST-011 | `server/src/__integration__/tasks.test.ts` | `pnpm --filter server test:integration` |
| TEST-012 | `server/src/__integration__/rbac.test.ts` | `pnpm --filter server test:integration` |

Integration tests need a local MongoDB (`MONGO_URI=mongodb://127.0.0.1:27017/task-man`, CON-407). Full gate:
`pnpm --filter server typecheck && pnpm --filter server test`, `pnpm --filter client typecheck && pnpm --filter
client test && pnpm --filter client lint`, `pnpm --filter client build` (CON-402). UI check in the browser at
`/{workspace}/projects`, `/{workspace}/projects/:projectId`, `/{workspace}/projects/:projectId/sprints/:sprintId/report`,
`/{workspace}/roadmap` and `/{workspace}/workload`.
