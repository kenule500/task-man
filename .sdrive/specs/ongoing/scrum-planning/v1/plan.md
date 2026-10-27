# Technical plan — scrum planning

> **Retroactive plan** — documents the design that already exists in the codebase (onboarded 2026-10-16). Not authored upfront.

- **Feature:** `scrum-planning` · **Version:** 1
- **Spec:** `.sdrive/specs/ongoing/scrum-planning/v1/spec.md`
- **Governance:** `.sdrive/governance/scrum-planning/v1/plan.json`

## Notation used below

- `action` on a component: `create` = module owned by this feature, `modify` = shared module this feature extends,
  `reuse` = shared module used unchanged.
- `action` on a data-model entity or field: `no_change`. Nothing in this feature alters a schema; the entities listed
  are the ones the existing implementation reads and writes.
- `action` on an API contract: `create` = endpoint owned by this feature, `reuse` = shared endpoint this feature
  drives (the task endpoints that carry the `sprint` field).

## Architecture

Projects and sprints are workspace-scoped Mongoose documents. The router
`server/src/routes/projectRoutes.ts` is mounted at `/api/workspaces/:slug/projects` with
`express.Router({ mergeParams: true })`, so `:slug` reaches the handlers; every route runs `protect` and then one
`requirePermission` area/action, which attaches `req.workspace`, `req.role` and `req.permissions` (CON-105,
CON-512). Handlers orchestrate and models persist (CON-103).

A task's sprint membership is `task.sprint` (ObjectId) plus `task.project` (the sprint's project name kept in step by
`reconcileSprint`). The sprint report does not store anything: it replays the `sprint` changes recorded in `Activity`
with `classifySprintScope` and returns the buckets.

On the client, the project page owns the backlog and sprint containers, and every analytical view is a pure function
in a `lib/` folder consumed by a page:

```
features/projects/lib/{burndown,velocity,sprintStats}.ts  -> ProjectWorkspace, SprintReportPage, ReportsPage
features/planning/lib/{roadmap,workload,capacity,sprintReport}.ts -> RoadmapPage, WorkloadPage, SprintReportPage
```

### Components

| Component | Action | Role |
|---|---|---|
| `server/src/models/projectModel.ts` | create | Project document: workspace scope, `nameKey` unique per workspace, generated `key`, colour/icon enums. |
| `server/src/models/sprintModel.ts` | create | Sprint document: project, name, goal, dates, status, `startedAt`, `completedAt`, `completedPoints`. |
| `server/src/controllers/projectController.ts` | create | Project and sprint handlers, validation chains, `syncProjectsFromTasks`, rename cascade, conditional state changes. |
| `server/src/routes/projectRoutes.ts` | create | Routes with `protect` + `requirePermission`. |
| `server/src/routes/workspaceRoutes.ts` | modify | Mounts the projects router and declares the read-only sprint report route (`projects:read`). |
| `server/src/controllers/reportController.ts` | create | `getSprintReport`, exported `classifySprintScope`. |
| `server/src/controllers/taskController.ts` | modify | Accepts `sprint` on create/update, validates with `findOpenSprint`, reconciles with the project. |
| `server/src/utils/activity.ts` | reuse | `recordActivity`/`diffFields` feed the report. |
| `client/src/features/projects/components/ProjectWorkspace.tsx` | create | Six tabs, sprint cards by status, move-to-sprint select, velocity card. |
| `client/src/features/projects/components/SprintFormDialog.tsx` | create | Create/edit sprint form with suggested name and dates. |
| `client/src/features/projects/components/CompleteSprintDialog.tsx` | create | Chooses where unfinished tasks go before completing. |
| `client/src/features/projects/lib/burndown.ts` | create | `buildBurndown`, `describeBurndown`. |
| `client/src/features/projects/lib/velocity.ts` | create | `sprintVelocities`, `averageVelocity`. |
| `client/src/features/projects/lib/sprintStats.ts` | create | `workProgress`, `formatSprintRange`, `suggestSprintDates`, `suggestSprintName`, `isSprintLate`. |
| `client/src/features/projects/hooks/useProjects.ts` | create | Projects with sprints through the shared query cache; mutations with readable errors. |
| `client/src/features/planning/lib/roadmap.ts` | create | `buildRoadmap`, `buildAxis`, `placeSpan`, `sprintBands`, `releaseMarkers`, `describe*`. |
| `client/src/features/planning/lib/workload.ts` | create | `tasksInScope`, `aggregateWorkload`, defaults, `describeLoad`. |
| `client/src/features/planning/lib/capacity.ts` | create | `parseCapacity`, `loadCapacity`, `saveCapacity`. |
| `client/src/features/planning/lib/sprintReport.ts` | create | Report types, `scopeTasksOf`, `deliveredPercent`, `pointsLabel`. |
| `client/src/features/planning/components/RoadmapTimeline.tsx` | create | Epic timeline with sprint bands, release markers, today line. |
| `client/src/features/planning/components/RoadmapList.tsx` | create | Narrow-screen epic list with progress and health. |
| `client/src/features/planning/components/WorkloadList.tsx` | create | Per-person rows with the capacity bar and their tasks. |
| `client/src/features/planning/components/ReportTable.tsx` | create | Task table of the report buckets. |
| `client/src/pages/RoadmapPage.tsx` | create | Project filter, month/week zoom, legend, timeline or list. |
| `client/src/pages/WorkloadPage.tsx` | create | Sprint or range scope, capacity input, workload list. |
| `client/src/pages/SprintReportPage.tsx` | create | Summary cards, burndown from `scopeTasksOf(report)`, five bucket tables. |
| `client/src/pages/ProjectDetailPage.tsx` | create | Hosts the sprint dialogs and remounts the task part after a sprint change. |

**Referenced requirements:** FR-001 … FR-011, NFR-001 … NFR-004.

## Data model

| Entity | Action | Fields (action) |
|---|---|---|
| Project | no_change | `workspace` (no_change), `name` 1–60 (no_change), `nameKey` unique per workspace (no_change), `key` `/^[A-Z0-9]{2,6}$/` (no_change), `description` ≤500 (no_change), `color`/`icon` enums (no_change), `archived` (no_change), `createdBy` (no_change, nullable) |
| Sprint | no_change | `workspace` (no_change), `project` (no_change), `name` 1–60 (no_change), `goal` ≤300 (no_change), `startDate`/`endDate` (no_change), `status` planned\|active\|completed (no_change), `startedAt`/`completedAt` (no_change, nullable), `completedPoints` ≥0 (no_change, nullable) |
| Task | no_change | `sprint` (no_change, nullable), `project` name ≤60 (no_change), `storyPoints` (no_change, nullable), `parent` (no_change, nullable), `type` (no_change), `status` (no_change), `completedAt` (no_change, nullable) |
| Activity | no_change | `workspace`, `action`, `task`, `project`, `sprint`, `changes[]`, `createdAt` with the 365-day TTL index (all no_change) |

**Flow.** `GET /projects` resolves the workspace from the slug, upserts a project per unrepresented `task.project`
name, then returns projects with their sprints attached. A sprint is created in a project, started
(`planned → active` + `startedAt`) and completed (`active → completed` + `completedAt` and `completedPoints` summed
over the completed top-level tasks), which also moves the unfinished tasks and records one `task.updated` entry per
carried-over task. Tasks join a sprint by writing `task.sprint` together with the sprint's project name. The report
later replays those `sprint` changes to rebuild committed, added, removed, completed and notCompleted.

## API contracts

| Method | Path | Action | Auth | Requirements |
|---|---|---|---|---|
| GET | `/api/workspaces/:slug/projects` | create | yes | FR-001, NFR-001, NFR-002 |
| POST | `/api/workspaces/:slug/projects` | create | yes | FR-001, NFR-001, NFR-002 |
| PATCH | `/api/workspaces/:slug/projects/:id` | create | yes | FR-001, NFR-001, NFR-002 |
| DELETE | `/api/workspaces/:slug/projects/:id` | create | yes | FR-001, NFR-001, NFR-002 |
| POST | `/api/workspaces/:slug/projects/:id/sprints` | create | yes | FR-002, NFR-001, NFR-002 |
| PATCH | `/api/workspaces/:slug/projects/:id/sprints/:sprintId` | create | yes | FR-002, NFR-001, NFR-002 |
| POST | `/api/workspaces/:slug/projects/:id/sprints/:sprintId/start` | create | yes | FR-003, NFR-002 |
| POST | `/api/workspaces/:slug/projects/:id/sprints/:sprintId/complete` | create | yes | FR-004, NFR-002 |
| DELETE | `/api/workspaces/:slug/projects/:id/sprints/:sprintId` | create | yes | FR-005, NFR-002 |
| GET | `/api/workspaces/:slug/projects/:projectId/sprints/:sprintId/report` | create | yes | FR-007, NFR-001, NFR-002 |
| POST | `/api/workspaces/:slug/tasks` | reuse | yes | FR-006, NFR-001 |
| PATCH | `/api/workspaces/:slug/tasks/:id` | reuse | yes | FR-006, NFR-001 |

Permission area/action per route: `projects:read` (list, report), `projects:write` (create/update project, all sprint
mutations), `projects:delete` (delete project), `tasks:write` (the reused task endpoints).

## Security considerations

- **NFR-001 — workspace isolation (CON-106).** `findProject`/`findSprint` and every query carry
  `workspace: req.workspace._id`; a valid ObjectId belonging to another workspace yields 404, never data. Ids are
  cast with `mongoose.isValidObjectId` first and no request value is interpolated into a raw query (CON-516).
- **NFR-002 — authorisation before the handler (CON-105, CON-512).** `protect` then `requirePermission(...)` on each
  route; the client mirrors this with `usePermissions` so actions that would 403 are not offered. Sprint planning is
  deliberately project work (`projects:write`), and deleting a project needs `projects:delete`.

## Performance considerations

- **NFR-003.** `listProjects` issues one `Promise.all` with two queries and groups sprints in memory rather than
  querying per project; the roadmap, workload, burndown and velocity values are pure functions over the already
  loaded task list and are memoised with `useMemo` in the pages.
- **NFR-001.** The sprint report reads `Activity` through the `{ workspace, action, createdAt }` index and selects
  only `task`, `changes`, `createdAt`; it then loads only the tasks pointing at the sprint or named by a recorded
  move.

## Dependencies

| Name | Type | Action | Notes |
|---|---|---|---|
| express | library | no_change | `mergeParams: true` so `:slug` reaches the project routes. |
| mongoose | library | no_change | Unique `{ workspace, nameKey }` on Project, `{ workspace, project, startDate }` on Sprint. |
| `client/src/features/tasks` | internal | no_change | `useTasks` and `lib/date`. |
| `client/src/features/projects` | internal | no_change | `index.ts` public surface reused by the planning pages. |
| `client/src/features/live` | internal | no_change | `useLiveRefresh('projects')` refetches after teammate changes. |

## Risks

| Risk | Mitigation |
|---|---|
| The report depends on activity rows that expire after 365 days. | Fall back to the tasks still pointing at the sprint and their creation dates (EC-007). |
| Completing or deleting a sprint moves tasks server-side while the client task list is a separate cache. | `ProjectDetailPage` keys the task-dependent part of the page by a counter that increments after such a change, remounting it to refetch. |
| A project rename must cascade to tasks, pages and custom fields. | One request updates all three with a case-insensitive collation; deleting instead unassigns tasks explicitly. |

## Verification

Unit and component tests for the helpers are listed under *Verification (retroactive)* in the spec (TEST-001 …
TEST-012), with the commands `pnpm --filter client test` and `pnpm --filter server test:integration`. The complete
gate is `pnpm --filter server typecheck && pnpm --filter server test` plus
`pnpm --filter client typecheck && pnpm --filter client test && pnpm --filter client lint` and
`pnpm --filter client build` (CON-402).
