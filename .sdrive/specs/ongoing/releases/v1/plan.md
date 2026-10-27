# Technical plan — releases

> **Retroactive plan** — documents the design that already exists in the codebase (onboarded 2026-10-16). Not authored upfront.

- **Feature:** `releases` · **Version:** 1
- **Spec:** `.sdrive/specs/ongoing/releases/v1/spec.md`
- **Governance:** `.sdrive/governance/releases/v1/plan.json`

## Notation used below

- `action` on a component: `create` = module owned by this feature, `modify` = shared module this feature extends,
  `reuse` = shared module used unchanged.
- `action` on a data-model entity or field: `no_change` (no schema change is part of this feature).
- `action` on an API contract: `create` = endpoint owned by this feature, `reuse` = shared endpoint this feature
  drives (the task endpoints that carry the `release` field).

## Architecture

A release is a project-scoped version document; the only thing a task stores about it is a reference, and everything
else is derived:

```
Release(workspace, project, name, dates, status)        Task(project, release, parent, status, storyPoints, number)
        |                                                        |
        +--> progress = summarizeProgress(tasks)  <--------------+
        +--> notes    = buildReleaseNotes(release, tasks, projectKey)
        +--> release  -> status released + releasedAt, and unfinished tasks keep / leave / move
```

`server/src/controllers/releaseController.ts` owns the lifecycle and the validation chains that are declared on the
router; the rules about which release a task may join are shared with the task controller through
`resolveRelease`/`reconcileRelease` instead of being duplicated, so the bulk update behaves like a single task update.
Everything that can be computed from a release and its tasks lives in `server/src/utils/releaseNotes.ts` (CON-109) and
is therefore tested without MongoDB (CON-407). On the client, the releases module owns the project tab, the release
page, the dialogs and the task field, and the roadmap reuses its own axis helpers to place release milestones.

### Components

| Component | Action | Role |
|---|---|---|
| `server/src/models/releaseModel.ts` | create | Release document, lower-cased `nameKey`, unique `{ workspace, project, nameKey }` index. |
| `server/src/utils/releaseNotes.ts` | create | `summarizeProgress`, `isReleaseOverdue`, `NOTE_GROUPS`, `taskKey`, `buildReleaseNotes`. |
| `server/src/controllers/releaseController.ts` | create | Validation chains and the seven handlers, with the conflict and date rules. |
| `server/src/routes/releaseRoutes.ts` | create | Seven routes with `protect` and `projects:read`/`projects:write`. |
| `server/src/routes/workspaceRoutes.ts` | modify | Mounts the releases router at `/:slug/releases`. |
| `server/src/models/taskModel.ts` | modify | The `release` reference and the `{ workspace, release }` index. |
| `server/src/controllers/taskController.ts` | modify | `resolveRelease`/`reconcileRelease` used by single and bulk updates. |
| `client/src/features/releases/types.ts` | create | `Release`, `ReleaseDetail`, `ReleaseTask`, `ReleaseProgress`, `ReleaseNotes`, `ReleaseInput`, `ReleasePatch`, `MoveOpenTo`. |
| `client/src/features/releases/api.ts` | create | `list`, `get`, `notes`, `create`, `update`, `remove`, `release`. |
| `client/src/features/releases/hooks/useReleases.ts` | create | Workspace releases through the query cache with refreshing mutations. |
| `client/src/features/releases/hooks/useRelease.ts` | create | One release with its project and tasks. |
| `client/src/features/releases/hooks/useReleaseStatus.ts` | create | Archive/reopen with a busy id and toasts. |
| `client/src/features/releases/lib/progress.ts` | create | Progress, date, suggestion, option and grouping helpers. |
| `client/src/features/releases/lib/notesMarkdown.ts` | create | `parseNotesMarkdown`, `splitNoteItem`. |
| `client/src/features/releases/components/ReleasesTab.tsx` | create | The Releases tab with the three status sections. |
| `client/src/features/releases/components/ReleaseCard.tsx` | create | One release with status, dates, progress and actions. |
| `client/src/features/releases/components/ReleaseFormDialog.tsx` | create | Create/edit form with the suggested name and dates and the date rule. |
| `client/src/features/releases/components/ReleaseNowDialog.tsx` | create | Where unfinished tasks go (next release, no release, keep). |
| `client/src/features/releases/components/ReleaseDialogs.tsx` | create | Dialog state for create, edit, release and delete. |
| `client/src/features/releases/components/ReleaseNotesPanel.tsx` | create | Notes rendered as plain data blocks with a copy action. |
| `client/src/features/releases/components/ReleaseStatusTag.tsx` | create | Status tag from `RELEASE_STATUS_META`. |
| `client/src/features/releases/components/TaskReleaseField.tsx` | create | The task's release select. |
| `client/src/features/releases/components/TaskReleaseLabel.tsx` | create | The task's release as a link, or `None`. |
| `client/src/features/releases/components/TaskReleaseDetail.tsx` | create | Release row of the task details block. |
| `client/src/pages/ReleasePage.tsx` | create | Release screen: status, dates, progress ring, grouped tasks, notes and actions. |
| `client/src/pages/ProjectDetailPage.tsx` | modify | Hosts the Releases tab and reloads tasks after a change. |
| `client/src/pages/RoadmapPage.tsx` | modify | Feeds the dated releases into `releaseMarkers` and opens the release page. |
| `client/src/features/planning/lib/roadmap.ts` | modify | Gains `ReleaseMarker`, `releaseMarkers`, `describeReleaseMarker`. |

**Referenced requirements:** FR-001 … FR-012, NFR-001 … NFR-004.

## Data model

| Entity | Action | Fields (action) |
|---|---|---|
| Release | no_change | `workspace`, `project`, `name` (1–60), `nameKey` (unique per project), `description` (≤2000), `startDate`/`releaseDate` (nullable), `status` (unreleased/released/archived), `releasedAt` (nullable), `createdBy` (nullable) — all no_change |
| Task | no_change | `release` (nullable), `project` (name, kept in step), `parent` (nullable), `status`, `storyPoints` (nullable), `number` (nullable), `type` |
| Project | no_change | `name` (join key), `key` (task key prefix), `color`, `icon` |
| Activity | no_change | `action` (release.created/updated/released/deleted, task.updated), `project`, `task` (nullable), `changes` |

**Flow.** A release is created inside a project with a unique name and optional dates. Tasks join it by writing
`task.release`; the release must be unreleased and belong to the task's project (a task without a project adopts the
release's project), subtasks follow their parent and epics are refused, and a task that later changes project loses
its release. Progress is derived: the release's top-level non-epic tasks are grouped into pending, in-progress and
completed with counts and story points, and an unreleased release past its date is flagged overdue. Releasing sets
`released`/`releasedAt` through a conditional update and then keeps, removes or re-homes the unfinished tasks (with
their subtasks) in another unreleased release of the same project, recording each move. Notes are generated on
request from the completed tasks, and deleting a release only clears the link on its tasks.

## API contracts

| Method | Path | Action | Auth | Requirements |
|---|---|---|---|---|
| GET | `/api/workspaces/:slug/releases` | create | yes | FR-004, NFR-001, NFR-002 |
| POST | `/api/workspaces/:slug/releases` | create | yes | FR-001, FR-002, NFR-001, NFR-002 |
| GET | `/api/workspaces/:slug/releases/:id` | create | yes | FR-005, FR-006, NFR-001, NFR-002 |
| PATCH | `/api/workspaces/:slug/releases/:id` | create | yes | FR-003, NFR-001, NFR-002 |
| DELETE | `/api/workspaces/:slug/releases/:id` | create | yes | FR-008, NFR-001, NFR-002 |
| POST | `/api/workspaces/:slug/releases/:id/release` | create | yes | FR-007, NFR-001, NFR-002 |
| GET | `/api/workspaces/:slug/releases/:id/notes` | create | yes | FR-009, NFR-001, NFR-002 |
| PATCH | `/api/workspaces/:slug/tasks/:id` | reuse | yes | FR-011, NFR-001 |
| PATCH | `/api/workspaces/:slug/tasks/bulk` | reuse | yes | FR-011, NFR-001 |

Permission area/action: `projects:read` for the list, detail and notes; `projects:write` for create, update, delete
and the release action. Query parameter: `project` (Mongo id) on the list.

## Security considerations

- **NFR-001 — workspace isolation (CON-106).** `findRelease` looks the id up together with `workspace:
  req.workspace._id`; projects and tasks of a release are resolved with the same id, and any release id coming from a
  request is validated against the workspace before it is used (CON-516: ids are cast, never interpolated raw).
- **NFR-002 — authorisation before the handler (CON-512).** `protect` then `requirePermission(...)` per route; the
  client hides create/edit/release/archive/delete unless the role holds `projects:write`.
- **NFR-004 — output safety (CON-517).** The generated notes are parsed into data blocks and rendered as text, so a
  task title containing markup stays text.

## Performance considerations

- **NFR-001.** `listReleases` loads the releases and then all of their tasks with a single query over the release
  ids, selecting only `status`, `storyPoints` and `release`, and groups them in memory instead of querying per
  release; `getRelease` runs the release, project and task queries in one `Promise.all`.
- **NFR-003.** Progress and notes are pure functions over an in-memory list, so the handlers only fetch and serialise.

## Dependencies

| Name | Type | Action | Notes |
|---|---|---|---|
| mongoose | library | no_change | Release documents and the unique index behind the duplicate-name rule. |
| express-validator | library | no_change | The four validation chains declared on the router. |
| `server/src/utils/activity.ts` | internal | no_change | Release lifecycle entries and one entry per moved task. |
| `server/src/controllers/taskController.ts` | internal | no_change | `resolveRelease`/`reconcileRelease` and the shared error handling. |
| `client/src/features/planning` | internal | modify | The roadmap axis model gains the release marker support. |

## Risks

| Risk | Mitigation |
|---|---|
| Releasing moves tasks server-side while the client task list is a separate cache. | `onTasksChanged` after a release or a delete reloads the task list. |
| Notes reflect the release's current tasks. | Removing is explicit and audited; the panel shows the live state and lets you copy the Markdown out. |
| A release can be left with no tasks. | `reconcileRelease` drops it on a project change, delete reports the count it unassigned, and the notes show the placeholder. |

## Verification

Suites are listed under *Verification (retroactive)* in the spec (TEST-001 … TEST-006): `pnpm --filter server test`
for the pure helpers, `pnpm --filter server test:integration` against a local MongoDB for the CRUD, the release
action, the task assignment rules, the notes and the permissions, and `pnpm --filter client test` for the helpers, the
components and the roadmap markers. Full gate: `pnpm --filter server typecheck && pnpm --filter server test`,
`pnpm --filter client typecheck && pnpm --filter client test && pnpm --filter client lint`, `pnpm --filter client
build` (CON-402).
