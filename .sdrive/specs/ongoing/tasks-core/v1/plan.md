> **Retroactive specification** — documents behaviour that already exists in the codebase (onboarded 2026-10-16). Not authored upfront.

# tasks-core — technical plan

| | |
|---|---|
| Feature | `tasks-core` |
| Version | 1 |
| Governance | `.sdrive/governance/tasks-core/v1/plan.json` |

> **How to read `action`** — this is a retroactive plan, so `create` means "this feature owns (and introduced) the file", `modify` means
> "the feature changed an existing file", and `reuse` means "the feature depends on it without owning it". `assumption: true` — the repository
> has no feature-level commit history that would prove which change introduced which line.

## 1. Approach

Layered exactly as the constitution requires (CON-103, CON-105):

1. **Routes** declare the path, the `express-validator` chain and the middleware order. Every task route is
   `protect` → `requirePermission('<area>:<action>')` → validation → controller (`server/src/routes/taskRoutes.ts`).
   The bulk routes are declared **before** `/:id` so that `bulk` is never read as a task id.
2. **Controllers** orchestrate: they validate rules that need the database (`assertValidDependencies`, `assertValidAssignees`,
   `findValidParent`, `resolveEpicLink`, `reconcileSprint`, `reconcileRelease`), then read or write through Mongoose and record activity.
3. **Pure helpers** hold everything that needs neither HTTP nor the database and are unit tested where they live:
   `server/src/utils/taskGraph.ts` (`wouldCreateCycle`), `taskQuery.ts` (`parseTaskListQuery`, `buildTaskFilter`, `buildTaskSort`),
   `taskNumbers.ts` (atomic numbers) and `recurrence.ts` (calendar-day date maths in UTC). This is CON-109 in practice.
4. **Two entries, one implementation**: `/api/workspaces/:slug/tasks` (`workspaceRoutes.ts` → `taskRoutes.ts`) and the `/api/tasks` alias
   (`activeTaskRoutes.ts` in `app.ts`). The alias only resolves the active workspace slug and re-dispatches to the same router via
   `workspaceRoutes(req, res, next)`, so permissions, validation and response shapes cannot diverge.
5. **Client**: one feature module owns the domain. `client/src/features/tasks/api.ts` is the only module that talks to the API,
   `hooks/useTasks.ts` is the single source of truth (shared query cache, optimistic updates with rollback, delete undo window, live refresh),
   pure rules live in `lib/`, and `index.ts` is the public surface other modules import (`@/features/tasks`, CON-110).
6. **Persistence**: MongoDB through Mongoose is the only datastore (CON-104). Schema-level limits (label count, checklist size, attachment
   count, unique relations, partial unique index on `(workspace, number)`) are the last line of defence behind the controller rules.

## 2. Components

| Path | Action | Notes |
|---|---|---|
| `server/src/models/taskModel.ts` | create | Task schema, enums, hierarchy, dependencies/relations, labels, checklist, watchers, recurrence, comments, attachments, `custom` map, indexes, `completedAt` hook. |
| `server/src/controllers/taskController.ts` | create | Validation chains, rule helpers, `getTasks`/`createTask`/`updateTask`/`deleteTask`, `cleanUpRemovedTasks`, `spawnNextOccurrence`, `duplicateTask`, watch toggles. |
| `server/src/controllers/taskRelationController.ts` | create | Typed links with their inverse, `blocks`/`blocked_by` mapped onto `dependencies`, `moveTask` for subtask conversion. |
| `server/src/controllers/taskExtrasController.ts` | create | Comments and GridFS attachments, including the author/uploader checks on delete. |
| `server/src/controllers/bulkTaskController.ts` | create | Up to 100 tasks per patch, everything validated before anything is saved, bulk delete with the subtask cascade. |
| `server/src/controllers/activityController.ts` | modify | `getTaskActivity` (per-task history with a `before` cursor) is this feature's; the workspace audit export in the same file belongs to the audit concern. |
| `server/src/routes/taskRoutes.ts` | create | Router with `mergeParams`, permission per route, bulk routes before `/:id`. |
| `server/src/routes/activeTaskRoutes.ts` | create | `/api/tasks` alias that resolves the active workspace and re-dispatches. |
| `server/src/routes/workspaceRoutes.ts` | modify | Mounts the task router at `/:slug/tasks`. |
| `server/src/app.ts` | modify | Router mounting, rate limits (a separate budget for live polls), private `no-cache` responses, `/api/health`. |
| `server/src/utils/taskGraph.ts` | create | `wouldCreateCycle`, `normalizeIds`. |
| `server/src/utils/taskQuery.ts` | create | Query parsing, filter building, sorting, custom filters, `taskNumberFromSearch`, `normalizeLabels`. |
| `server/src/utils/taskNumbers.ts` | create | `reserveTaskNumbers`, `ensureTaskNumbers`. |
| `server/src/utils/recurrence.ts` | create | Validation and next dates for repeating tasks. |
| `server/src/utils/activity.ts` | reuse | `recordActivity`, `diffFields`, `describeTaskChanges`. |
| `server/src/models/activityModel.ts` | reuse | Audit entry storage and its action list. |
| `server/src/utils/gridfs.ts` | reuse | Attachment buckets and `deleteFiles`. |
| `server/src/utils/customFields.ts` | reuse | Value coercion and change description. |
| `server/src/utils/customFieldsDb.ts` | reuse | `planRequestCustom` for a request. |
| `server/src/utils/workflow.ts` | reuse | `stageFor`/`workflowOf` keep stage and status consistent. |
| `server/src/middleware/authMiddleware.ts` | reuse | `protect` (JWT + database session). |
| `server/src/middleware/permissionMiddleware.ts` | reuse | `requirePermission` attaches `req.workspace`, `req.role`, `req.permissions`. |
| `server/src/config/permissions.ts` | reuse | `tasks:read`, `tasks:write`, `tasks:delete`. |
| `server/src/middleware/uploadMiddleware.ts` | reuse | Upload handling and MIME allow-list. |
| `client/src/features/tasks/api.ts` | create | Every task endpoint, including bulk, duplicate, watch, relations, move, activity, comments, attachments. |
| `client/src/features/tasks/hooks/useTasks.ts` | create | Single source of truth: cache, optimistic updates, undo delete, live refresh. |
| `client/src/features/tasks/types.ts` | create | `Task`, `TaskInput`, `TaskPatch`, `TaskFilters` and the related shapes. |
| `client/src/features/tasks/lib/date.ts` | create | Calendar-day helpers. |
| `client/src/features/tasks/lib/filters.ts` | create | Client mirror of the list query (URL round-trip, matching, sorting, fractional drop position). |
| `client/src/features/tasks/lib/taskKey.ts` | create | Task keys and shareable links. |
| `client/src/features/tasks/lib/subtasks.ts` | create | Subtask indexing, counting and the flattened list arrangement. |
| `client/src/features/tasks/lib/taskForm.ts` | create | Form normalisation and validation. |
| `client/src/features/tasks/lib/checklist.ts` | create | Checklist progress. |
| `client/src/features/tasks/lib/relations.ts` | create | Link labels and inverse mapping. |
| `client/src/features/tasks/components/*.tsx` | create | `TaskFormDialog`, `TaskDetailDialog`, `TaskComments`, `TaskAttachments`, `TaskActivity`, `TaskChecklist`, `TaskRelations`, `SubtaskList`, `ConvertToSubtaskDialog`, `TaskWatchToggle`, `ConfirmTaskDelete`, `BulkActionBar`. |
| `client/src/features/tasks/index.ts` | create | Public surface (CON-110). |
| `client/src/pages/TaskPage.tsx` | modify | Hosts `useTasks`, URL state, dialogs, bulk handlers and the CSV export. |

## 3. Data model

| Entity | Action | Fields added by this feature |
|---|---|---|
| `Task` | create | `number`, `title`, `description`, `status`, `stage`, `priority`, `type`, `storyPoints`, `estimateMinutes`, `loggedMinutes`, `project`, `sprint`, `parent`, `epic`, `release`, `startDate`, `deadline`, `position`, `dependencies`, `relations`, `labels`, `assignees`, `checklist`, `watchers`, `recurrence`, `comments`, `attachments`, `custom`, `owner`, `workspace`, `completedAt` (see `plan.json` for the exact types and the schema limits). |
| `Workspace` | update | `taskCounter` (atomic `$inc` source for task numbers). |
| `Activity` | no_change | `action`, `task`, `changes` are reused as they are. |
| `TimeEntry` | no_change | Only touched by the delete cascade. |

Relevant indexes on `Task`: `(workspace, deadline)`, `(workspace, position)`, `(workspace, assignees)`, `(workspace, labels)`,
`(workspace, sprint)`, `(workspace, number)` unique-partial, `(workspace, parent)`, `(workspace, epic)`, `(workspace, release)`,
`(workspace, status)`, `(workspace, project)`, `(workspace, dependencies)`.

### Flow

`GET /tasks` → `parseTaskListQuery` → `Task.aggregate` (`$match` on the workspace filter, `$addFields` priority rank, `$sort`, `$project`) →
populate `name avatarUrl` only.

A write → validate the body → apply the rules (dates, dependencies, assignees, parent/epic/release/sprint, stage from the workflow, custom values)
→ reserve a task number when needed → save → `recordActivity` → `notifyTaskEvents` → answer with the populated task.

Completion of a recurring task additionally creates the next occurrence and clears the rule on the completed one. Deletion runs the shared cascade
(subtasks → GridFS files → dependants → relations → epics → time entries).

## 4. API contracts

Routes are mounted in `server/src/routes/taskRoutes.ts` under `/api/workspaces/:slug/tasks` (`workspaceRoutes.ts:207`) and mirrored by
`/api/tasks` (`activeTaskRoutes.ts`, mounted in `app.ts`). All of them require authentication (`protect`) and the permission named below.

| Method | Path | Permission | Requirement |
|---|---|---|---|
| GET | `/api/workspaces/:slug/tasks` | `tasks:read` | FR-004, FR-006, NFR-001 |
| POST | `/api/workspaces/:slug/tasks` | `tasks:write` | FR-001, FR-005, NFR-002 |
| PUT / PATCH | `/api/workspaces/:slug/tasks/:id` | `tasks:write` | FR-002 |
| DELETE | `/api/workspaces/:slug/tasks/:id` | `tasks:delete` | FR-003 |
| PATCH | `/api/workspaces/:slug/tasks/bulk` | `tasks:write` | FR-012 |
| POST | `/api/workspaces/:slug/tasks/bulk-delete` | `tasks:delete` | FR-012 |
| POST | `/api/workspaces/:slug/tasks/:id/duplicate` | `tasks:write` | FR-009 |
| POST / DELETE | `/api/workspaces/:slug/tasks/:id/watch` | `tasks:read` | FR-010 |
| POST | `/api/workspaces/:slug/tasks/:id/relations` | `tasks:write` | FR-005 |
| DELETE | `/api/workspaces/:slug/tasks/:id/relations/:relatedId` | `tasks:write` | FR-005 |
| POST | `/api/workspaces/:slug/tasks/:id/move` | `tasks:write` | FR-007 |
| GET | `/api/workspaces/:slug/tasks/:id/activity` | `tasks:read` | FR-011 |
| POST / DELETE | `/api/workspaces/:slug/tasks/:id/comments[/:commentId]` | `tasks:write` | FR-010, NFR-002 |
| POST / GET / DELETE | `/api/workspaces/:slug/tasks/:id/attachments[/:attachmentId]` | `tasks:write` (GET `tasks:read`) | FR-003, FR-010 |
| GET / POST / PATCH / DELETE | `/api/tasks[/:id]` | same router | alias of the above |

## 5. Security, performance, dependencies and risks

- **Security** — every query is scoped to `req.workspace._id` (NFR-001); permissions come from `config/permissions.ts` through
  `requirePermission` (NFR-002); only `name` and `avatarUrl` are ever populated for a user, so no email, hash or token leaves the API.
- **Performance** — the list is one workspace-indexed aggregation reused by every view through the client's shared cache; drag interactions send
  small patches; task numbers use a single atomic `$inc` instead of a counter read-modify-write.
- **Dependencies** — `mongoose`, `express-validator`, `axios` (client), and the internal helpers listed above; MongoDB is the only datastore.
- **Risks** — see `plan.json` (delete cascade, two router entries, client mirrors of server rules) and `spec.md` §6.

## 6. Retroactive validation

The plan is confirmed by the tests listed in `spec.md` §7 and by the governance validators
(`node .sdrive/scripts/validate-governance.js`). The commands are the repository quality gates (CON-402):
`pnpm --filter server typecheck && pnpm --filter server test`, `pnpm --filter client typecheck && pnpm --filter client test && pnpm --filter client lint`, `pnpm --filter client build`.
