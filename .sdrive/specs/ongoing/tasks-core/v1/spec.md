> **Retroactive specification** — documents behaviour that already exists in the codebase (onboarded 2026-10-16). Not authored upfront.

# tasks-core — functional specification

| | |
|---|---|
| Feature | `tasks-core` |
| Version | 1 |
| Status | Retroactive (behaviour already shipped and verified by the tests listed below) |
| Governance | `.sdrive/governance/tasks-core/v1/{spec,plan,tasks,traceability}.json` |

## 1. Overview

### Problem statement

Teams need one validated record of work: create a task, keep it in the right place in the hierarchy, find it again among many, work on it together, and close it out. Without server-side rules the record drifts — dependency cycles, subtasks of subtasks, orphaned files, duplicate task keys — and no report or view can be trusted.

### Proposed solution

A workspace-scoped task API: Express 5 routers that declare the path, the `express-validator` chain and `requirePermission('<area>:<action>')`
(`server/src/routes/taskRoutes.ts`, `server/src/routes/workspaceRoutes.ts`), controllers that orchestrate Mongoose models
(`server/src/controllers/taskController.ts`, `taskRelationController.ts`, `taskExtrasController.ts`, `bulkTaskController.ts`, `activityController.ts`),
and pure helpers for every rule that needs neither HTTP nor the database (`server/src/utils/taskGraph.ts`, `taskQuery.ts`, `taskNumbers.ts`, `recurrence.ts`).
The client mirrors the same semantics inside one reusable feature module (`client/src/features/tasks`), whose `useTasks` hook is the single source of truth
for every view and applies optimistic updates with rollback.

### Target audience

Workspace members and administrators who plan and run work in the list, board, calendar or timeline views of TaskMan.

### Assumptions

- The notification audience of a task event (assignees, watchers, mentions) is taken from the call sites of `notifyTaskEvents` in
  `server/src/controllers/taskController.ts`; `server/src/utils/notify.ts` was not read in full. `assumption: true`
- The `action` values in `plan.json` describe what this feature is responsible for; the repository has no feature-level commit history that
  would prove which commit introduced which line. `assumption: true`
- The integration tests run against MongoDB 7 as configured in `.github/workflows/ci.yml`, so operator behaviour (`$addToSet`, `$pull`, the
  partial unique index on `(workspace, number)`) is assumed to match that server version. `assumption: true`

### Out of scope

- Time tracking on a task: `GET|POST /:id/time`, `POST /:id/timer/start|stop`, `DELETE /:id/time/:entryId` on the same router
  (`server/src/controllers/timeController.ts`) — a separate feature.
- GitHub development links held in `task.links` (`server/src/models/taskModel.ts`, `integrationController.ts`, `githubWebhookController.ts`) —
  maintained by the integrations feature, only read here.
- Sprint, project and release lifecycles that `reconcileSprint`, `reconcileRelease` and `findOpenSprint` call into; this feature only keeps a
  task's own references valid.

## 2. User stories and acceptance criteria

### US-001 — Create and change tasks under server-enforced rules
*As a* workspace member *I want* to create a task with a title, a due date and the optional details, and change any of those fields later,
*so that* the plan of record stays accurate without policing it by hand.

- **AC-001** Creating a task requires a non-empty title of at most 140 characters and a valid ISO 8601 deadline (`validateCreateTask`,
  `server/src/controllers/taskController.ts:154`); a missing title answers 400 with the validation errors.
- **AC-002** A start date after the deadline is refused with `Start date must be on or before the deadline` (`assertDateOrder`,
  `server/src/controllers/taskController.ts:178`), and a deadline must be a parseable date.
- **AC-003** Only the fields in `EDITABLE_FIELDS` (`server/src/controllers/taskController.ts:41`) can be changed through `PUT|PATCH /:id`,
  and a task id that is not in the requesting workspace answers 404 (`updateTask` → `Task.findOne({ _id: id, workspace: workspace._id })`).

### US-002 — Organise work with subtasks, epics and dependencies
*As a* workspace member *I want* to break a task into one level of subtasks, group items under an epic and declare which tasks must finish first,
*so that* the order of work is explicit and the schedule can be trusted.

- **AC-004** A dependency must be a task of the same workspace, must not be the task itself and must not close a cycle
  (`assertValidDependencies` + `wouldCreateCycle` in `server/src/utils/taskGraph.ts`); each violation has its own message
  (`Dependencies must be tasks from this workspace`, `A task cannot depend on itself`, `This dependency would create a cycle`) and nothing is saved.
- **AC-005** Subtasks stay one level deep: an epic cannot have subtasks, a subtask cannot have subtasks, a task that has subtasks cannot become one,
  and a task cannot be its own parent (`findValidParent`, `moveTask` in `server/src/controllers/taskRelationController.ts:216`).
- **AC-006** A subtask follows its parent between project, sprint, epic and release (`createTask`, and the `Task.updateMany` over
  `{ workspace, parent: task._id }` at the end of `updateTask`).
- **AC-007** Deleting a task removes it from the dependency lists and typed relations that point at it, clears the epic of the items it grouped,
  and deletes its subtasks with it (`deleteTask` + `cleanUpRemovedTasks`, `server/src/controllers/taskController.ts:694`).

### US-003 — Find a task with filters, sorting and the task key
*As a* workspace member *I want* to list the tasks of the workspace with the filters I need and search by title, description or key,
*so that* I can reach the task I mean instead of scrolling.

- **AC-008** `GET /tasks` accepts `status`, `search`, `project`, `label`, `assignee` (`me` or a user id), `epic` (id or `none`), `from`, `to`,
  `sort` and up to five `cf.<key>` filters (`parseTaskListQuery` in `server/src/utils/taskQuery.ts`); unknown or oversized values fall back to
  the defaults instead of failing.
- **AC-009** Search matches title and description case-insensitively (escaped regex) and also finds a task by number when the text looks like
  `WEB-12`, `#12` or `12` (`taskNumberFromSearch`).
- **AC-010** Every task gets a sequential number reserved atomically (`reserveTaskNumbers`), legacy tasks without a number are backfilled oldest
  first (`ensureTaskNumbers`), and the number is shown as `<project key>-<number>` — `TM-12` without a project key
  (`client/src/features/tasks/lib/taskKey.ts`, `DEFAULT_KEY_PREFIX`).

### US-004 — Collaborate on a task and follow its history
*As a* workspace member *I want* to comment on a task, attach files, follow it and read what changed,
*so that* discussion and evidence live with the task instead of in chat.

- **AC-011** A comment is 1 to 2000 characters (`MAX_COMMENT_LENGTH`, `validateComment`); only its author or a role holding `settings:manage`
  may delete it, and a comment that is not on the task answers 404 (`deleteComment`, `server/src/controllers/taskExtrasController.ts:112`).
- **AC-012** Attachments are stored in GridFS (bucket `attachments`) behind an allow-list of MIME types with sanitized names
  (`uploadAttachmentFile`, `server/src/middleware/uploadMiddleware.ts`), at most 20 per task (`MAX_ATTACHMENTS`), and deleting the task deletes
  its stored files (`cleanUpRemovedTasks` → `deleteFiles`).
- **AC-013** `GET /:id/activity` returns field changes, comments and file events newest first, at most 100 per page (`parseLimit`/`MAX_LIMIT`),
  with a `before` cursor for the next (older) page (`page()` in `server/src/controllers/activityController.ts:32`).
- **AC-014** `POST|DELETE /:id/watch` adds or removes the signed-in user in `task.watchers` and answers with the watcher ids; it can never change
  another member's follow state (`setWatching`, `server/src/controllers/taskController.ts:922`).

### US-005 — Repeat, copy and bulk-edit work
*As a* workspace member *I want* a task to repeat when I complete it, to copy a task, and to apply one change to many tasks at once,
*so that* recurring chores and sprint hygiene take seconds instead of a checklist.

- **AC-015** Completing a recurring top-level task creates its next occurrence (`nextOccurrenceDates`, basis `due`|`completion`) and clears the
  rule on the completed task, so a reopen cannot spawn a second copy; a subtask or an epic cannot repeat (`assertCanRecur`,
  `spawnNextOccurrence` at `server/src/controllers/taskController.ts:793`).
- **AC-016** `POST /:id/duplicate` creates `Copy of <title>` as a pending task with the source's content, estimate and custom values but no
  comments, attachments, links, dependencies or watchers, and with checklist items undone (`copiedFields`); direct subtasks can be copied with it.
- **AC-017** Bulk update and bulk delete accept at most 100 ids, check every task before saving any of them, and answer with the changed tasks or
  with the deleted ids plus the subtasks that went with them (`bulkTaskController.ts`, `validateBulkUpdate`/`validateBulkDelete`).

## 3. Functional requirements

| ID | Requirement | Evidence in the repository |
|---|---|---|
| FR-001 | Create a task through `POST /api/workspaces/:slug/tasks` with a required title (≤140) and deadline, the documented optional fields, workspace scoping, an atomically reserved number and an activity entry. | `taskController.createTask` (`server/src/controllers/taskController.ts:460`), `taskRoutes.ts`, `taskNumbers.reserveTaskNumbers` |
| FR-002 | Update a task through `PUT` / `PATCH .../:id`, applying only the allow-listed editable fields, keeping `stage`/`status` in sync, running the same rule checks and answering 404 outside the workspace. | `taskController.updateTask` (`:566`), `EDITABLE_FIELDS`, `server/src/utils/workflow.ts` (`stageFor`) |
| FR-003 | Delete a task with its subtasks and GridFS attachments, pulling it out of dependants' dependency lists and typed relations and clearing the epic of its items. | `taskController.deleteTask` (`:717`), `cleanUpRemovedTasks` (`:694`) |
| FR-004 | List the workspace's tasks with the supported query parameters (status, search, project, label, assignee, epic, from, to, sort, `cf.<key>`) parsed by `parseTaskListQuery` and ordered by `buildTaskSort`. | `server/src/utils/taskQuery.ts`, `taskController.getTasks` (`:437`) |
| FR-005 | Validate dependencies server-side (valid ids, same workspace, not itself, cycle-free) with the pure `taskGraph.wouldCreateCycle` helper before any write. | `server/src/utils/taskGraph.ts`, `assertValidDependencies` (`:191`) |
| FR-006 | Number tasks sequentially per workspace with an atomic `$inc` on `Workspace.taskCounter` and backfill legacy tasks before the list is served. | `server/src/utils/taskNumbers.ts`, `Workspace` schema (`taskCounter`) |
| FR-007 | Keep the hierarchy valid: one level of subtasks, no repeating subtasks, inherited project/sprint/epic/release, and `POST /:id/move` to reparent or promote. | `findValidParent`, `taskRelationController.moveTask` (`:216`) |
| FR-008 | Spawn the next occurrence of a recurring task when it is completed and clear the rule on the completed task. | `server/src/utils/recurrence.ts`, `spawnNextOccurrence` (`:793`) |
| FR-009 | Duplicate a task, optionally with its direct subtasks, as a new pending task that keeps content but not history. | `duplicateTask` (`:839`), `copiedFields` |
| FR-010 | Comment on, attach files to and follow a task with the documented limits and per-item ownership checks. | `server/src/controllers/taskExtrasController.ts`, `setWatching` |
| FR-011 | Record task events in the workspace activity log and expose a task's own history with a `before` cursor and page limit. | `server/src/utils/activity.ts`, `activityController.getTaskActivity` (`:66`) |
| FR-012 | Apply one patch to up to 100 tasks and delete several tasks with their subtasks, validating every task before saving any. | `server/src/controllers/bulkTaskController.ts` |

## 4. Non-functional requirements

| ID | Requirement | Constitution |
|---|---|---|
| NFR-001 | Every task read and write filters by `req.workspace._id`; data is never read or written across workspaces. | CON-106 |
| NFR-002 | Routes declare the path, the `express-validator` chain and `requirePermission('tasks:read` / `tasks:write` / `tasks:delete')`; controllers do not re-implement authorization. The remaining per-item checks (comment author, attachment uploader) compare the session user with the stored owner. | CON-105, CON-107 |
| NFR-003 | Dates are calendar days — `YYYY-MM-DD` on the wire, produced and parsed with `client/src/features/tasks/lib/date.ts`; `new Date('YYYY-MM-DD')` is never used for display. | CON-203 |
| NFR-004 | Correct under concurrency and partial failure: numbers come from an atomic `$inc`, watcher changes use `$addToSet`/`$pull`, and the client writes optimistically with rollback plus a reload when the server performs a side effect. | CON-109 (pure helpers unit tested), CON-402 |

## 5. Edge cases

| ID | Case | Expected behaviour |
|---|---|---|
| EC-001 | A dependency or assignee id from another workspace, or not an id at all. | 400 `Dependencies must be tasks from this workspace` / `Assignees must be members of this workspace`; nothing is written. |
| EC-002 | The tab is closed inside the six-second undo window (`DELETE_UNDO_MS`). | The `pagehide` listener calls `flushDeletes`, so the delete is sent before the page goes away; a failure restores the task and shows the API message. |
| EC-003 | Loading tasks fails with 403/404 (wrong workspace, revoked membership). | The list is emptied, an error naming the workspace is shown, and the failed response is not cached (`cacheableRef`, `invalidate`). |
| EC-004 | A background/live refresh answers while the user has unsaved optimistic edits. | The response is discarded (`changesRef`, `busyRef`); the user's version wins. |
| EC-005 | A recurring task is completed, reopened and completed again. | No second occurrence — `spawnNextOccurrence` clears `recurrence` on the source as it creates the next one. |
| EC-006 | A task created before numbers existed is listed or searched by key. | `ensureTaskNumbers` fills the missing numbers oldest first (a concurrent backfill keeps its own number). |
| EC-007 | `assignee=me` without an authenticated user. | The filter becomes `{ $in: [] }`, which never widens the result set. |
| EC-008 | Deleting a task other tasks depend on. | The dependants stay and simply lose that dependency; the deleted task's time entries go with it. |

## 6. Dependencies and risks

Dependencies: `mongodb (mongoose 9)`, `express-validator`, `workflow stages` (`server/src/utils/workflow.ts`), `custom fields`
(`customFields.ts`, `customFieldsDb.ts`), `GridFS` (`server/src/utils/gridfs.ts`), the activity log, live updates and `jest` + `@swc/jest`.

| Risk | Mitigation |
|---|---|
| RISK-001 `GET /tasks` returns every task of the workspace (no server-side pagination). | Workspace-indexed aggregation and client-side board pagination (`BOARD_PAGE_SIZE = 10`); a paged endpoint would be a new version. |
| RISK-002 The delete cascade touches subtasks, files, dependencies, relations, epics and time entries. | One shared `cleanUpRemovedTasks` for single and bulk delete, repeatable `$pull` updates, and integration tests. |
| RISK-003 A recurring task could spawn twice. | `spawnNextOccurrence` clears `recurrence` on the source and refuses subtasks. |
| RISK-004 Optimistic updates can diverge from the stored task. | `applyPatch` mirrors the server rules, failures roll back and show the API message, and side effects trigger `reload()`. |

## 7. Verification (retroactive)

Every acceptance criterion above is covered by tests that already exist. Commands:

```
pnpm --filter server test              # unit tests
pnpm --filter server test:integration  # real MongoDB
pnpm --filter client test              # jsdom + Testing Library
```

| TEST id | Test file | Command |
|---|---|---|
| TEST-001 | `server/src/__tests__/taskQuery.test.ts` | `pnpm --filter server test` |
| TEST-002 | `server/src/__tests__/taskGraph.test.ts` | `pnpm --filter server test` |
| TEST-003 | `server/src/__tests__/taskController.test.ts` | `pnpm --filter server test` |
| TEST-004 | `server/src/__tests__/recurrence.test.ts` | `pnpm --filter server test` |
| TEST-005 | `server/src/__tests__/bulkTaskController.test.ts` | `pnpm --filter server test` |
| TEST-006 | `server/src/__tests__/taskExtras.test.ts` | `pnpm --filter server test` |
| TEST-007 | `server/src/__tests__/taskRoutes.test.ts` | `pnpm --filter server test` |
| TEST-008 | `server/src/__tests__/epicRules.test.ts` | `pnpm --filter server test` |
| TEST-009 | `server/src/__tests__/activity.test.ts` | `pnpm --filter server test` |
| TEST-010 | `server/src/__integration__/tasks.test.ts` | `pnpm --filter server test:integration` |
| TEST-011 | `server/src/__integration__/relations.test.ts` | `pnpm --filter server test:integration` |
| TEST-012 | `server/src/__integration__/comments.test.ts` | `pnpm --filter server test:integration` |
| TEST-013 | `server/src/__integration__/attachments.test.ts` | `pnpm --filter server test:integration` |
| TEST-014 | `server/src/__integration__/bulk.test.ts` | `pnpm --filter server test:integration` |
| TEST-015 | `client/src/features/tasks/__tests__/useTasks.test.tsx` | `pnpm --filter client test` |
| TEST-016 | `client/src/features/tasks/__tests__/filters.test.ts` | `pnpm --filter client test` |
| TEST-017 | `client/src/features/tasks/__tests__/date.test.ts` | `pnpm --filter client test` |
| TEST-018 | `client/src/features/tasks/__tests__/taskForm.test.ts` | `pnpm --filter client test` |
| TEST-019 | `client/src/features/tasks/__tests__/taskKey.test.ts` | `pnpm --filter client test` |
| TEST-020 | `client/src/features/tasks/__tests__/moveTaskSheet.test.tsx` | `pnpm --filter client test` |
| TEST-021 | `client/src/features/tasks/__tests__/subtasks.test.ts` | `pnpm --filter client test` |
| TEST-022 | `client/src/features/tasks/__tests__/recurrence.test.ts` | `pnpm --filter client test` |
| TEST-023 | `client/src/features/tasks/__tests__/relations.test.tsx` | `pnpm --filter client test` |
| TEST-024 | `client/src/features/tasks/__tests__/TaskComments.test.tsx` | `pnpm --filter client test` |
| TEST-025 | `client/src/features/tasks/__tests__/taskExtrasUi.test.tsx` | `pnpm --filter client test` |
| TEST-026 | `client/src/features/tasks/__tests__/taskActivity.test.tsx` | `pnpm --filter client test` |
| TEST-027 | `client/src/features/tasks/__tests__/bulkEdit.test.tsx` | `pnpm --filter client test` |
| TEST-028 | `client/src/features/tasks/__tests__/checklist.test.ts` | `pnpm --filter client test` |
