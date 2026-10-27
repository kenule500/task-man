> **Retroactive specification** — documents behaviour that already exists in the codebase (onboarded 2026-10-16). Not authored upfront.

# tasks-core — execution tasks

| | |
|---|---|
| Feature | `tasks-core` |
| Version | 1 |
| Governance | `.sdrive/governance/tasks-core/v1/tasks.json` |

Every task below is already implemented and verified, so each line is checked. Test ids refer to `spec.md` §7.

## P1 — Persistence and pure rules

- [x] **T1.1 Model the task document with its schema-level limits** — `server/src/models/taskModel.ts` (FR-001, FR-003, FR-007, FR-010, FR-011; AC-001, AC-007)
- [x] **T1.2 Write the pure dependency-graph helpers** — `server/src/utils/taskGraph.ts` + `server/src/__tests__/taskGraph.test.ts` (FR-005; AC-004; TEST-002)
- [x] **T1.3 Parse and build the task list query** — `server/src/utils/taskQuery.ts` + `server/src/__tests__/taskQuery.test.ts` (FR-004; AC-008, AC-009; TEST-001)
- [x] **T1.4 Reserve and backfill task numbers** — `server/src/utils/taskNumbers.ts` (FR-006; AC-010)
- [x] **T1.5 Validate recurrences and compute the next dates** — `server/src/utils/recurrence.ts` + `server/src/__tests__/recurrence.test.ts` (FR-008; AC-015; TEST-004)

## P2 — Task API

- [x] **T2.1 Declare the task router and its permissions** — `server/src/routes/taskRoutes.ts`, `activeTaskRoutes.ts`, `workspaceRoutes.ts` (FR-001, FR-004, FR-012, NFR-001, NFR-002; TEST-007)
- [x] **T2.2 Create tasks with the full rule set** — `createTask` (FR-001; AC-001, AC-002, AC-010; TEST-003, TEST-010, TEST-018)
- [x] **T2.3 Update only the editable fields of a task** — `updateTask` + `EDITABLE_FIELDS` + `workflow.stageFor` (FR-002, NFR-001; AC-003, AC-006; TEST-003, TEST-015)
- [x] **T2.4 Delete a task with the full cascade** — `deleteTask` + `cleanUpRemovedTasks` (FR-003; AC-007, AC-012; TEST-010, TEST-013)
- [x] **T2.5 Typed relations and subtask moves** — `server/src/controllers/taskRelationController.ts` (FR-005, FR-007; AC-004, AC-005, AC-006; TEST-008, TEST-011)
- [x] **T2.6 Comments and GridFS attachments** — `server/src/controllers/taskExtrasController.ts` (FR-010, NFR-002; AC-011, AC-012; TEST-006, TEST-012, TEST-013)
- [x] **T2.7 Serve the per-task activity history** — `activityController.getTaskActivity` (FR-011; AC-013; TEST-009, TEST-026)
- [x] **T2.8 Duplicate tasks and spawn the next occurrence** — `duplicateTask`, `spawnNextOccurrence`, `copiedFields` (FR-008, FR-009; AC-015, AC-016; TEST-004, TEST-022)
- [x] **T2.9 Bulk update and bulk delete** — `server/src/controllers/bulkTaskController.ts` (FR-012; AC-017; TEST-005, TEST-014)
- [x] **T2.10 Follow and unfollow a task** — `watchTask`/`unwatchTask` (FR-010; AC-014; TEST-006)

## P3 — Client feature module

- [x] **T3.1 Wrap every task endpoint in one API module** — `client/src/features/tasks/api.ts` (FR-001, FR-012; TEST-027)
- [x] **T3.2 Make useTasks the single source of truth** — `client/src/features/tasks/hooks/useTasks.ts` (FR-002, FR-007, FR-012, NFR-004; AC-003, AC-006; TEST-015)
- [x] **T3.3 Add the date, filter and task-key libraries** — `lib/date.ts`, `lib/filters.ts`, `lib/taskKey.ts` (FR-004, NFR-003; AC-008, AC-009, AC-010; TEST-016, TEST-017, TEST-019)
- [x] **T3.4 Build the create/edit form on shared form rules** — `lib/taskForm.ts`, `components/TaskFormDialog.tsx` (FR-001; AC-001, AC-002; TEST-018)
- [x] **T3.5 Build the detail surfaces for collaboration** — `TaskDetailDialog`, `SubtaskList`, `TaskRelations`, `ConvertToSubtaskDialog`, `TaskChecklist`, `TaskComments`, `TaskAttachments`, `TaskActivity`, `TaskWatchToggle` (FR-007, FR-010, FR-011; AC-005, AC-011, AC-013, AC-014; TEST-020, TEST-021, TEST-024, TEST-025, TEST-026)
- [x] **T3.6 Wire the feature into the task page** — `client/src/pages/TaskPage.tsx` (FR-002, FR-004, FR-011, FR-012; AC-003, AC-008, AC-017; TEST-015, TEST-027)

## P4 — Verification

- [x] **T4.1 Cover the server rules with unit tests** — `server/src/__tests__/{taskQuery,taskGraph,taskController,recurrence,bulkTaskController,taskExtras,taskRoutes,epicRules,activity}.test.ts` (TEST-001 … TEST-009)
- [x] **T4.2 Cover the API end to end with integration tests** — `server/src/__integration__/{tasks,relations,comments,attachments,bulk}.test.ts` (TEST-010 … TEST-014)
- [x] **T4.3 Cover the client module with tests** — `client/src/features/tasks/__tests__/*` (TEST-015 … TEST-028)
- [x] **T4.4 Pass the repository quality gates** — `pnpm --filter server typecheck && pnpm --filter server test`; `pnpm --filter client typecheck && pnpm --filter client test && pnpm --filter client lint`; `pnpm --filter client build` (CON-402)
