# Execution tasks — releases

> **Retroactive task list** — every task below is already implemented and merged; the list records the work that
> produced the behaviour in `.sdrive/specs/ongoing/releases/v1/spec.md` (onboarded 2026-10-16). Not authored upfront.

- **Feature:** `releases` · **Version:** 1
- **Governance:** `.sdrive/governance/releases/v1/tasks.json`
- All tasks are `completed: true`; the checkbox state mirrors `tasks.json`.

## P1 — Release model and pure helpers

- [x] **T1.1 Release model with the per-project unique name** — `server/src/models/releaseModel.ts`: workspace, project, name, `nameKey`, description, dates, status, `releasedAt`, `createdBy`, the unique `{ workspace, project, nameKey }` index and the `nameKey` set in a pre-validate hook. → FR-001, NFR-001 (AC-001)
- [x] **T1.2 Pure progress and release-notes helpers with tests** — `server/src/utils/releaseNotes.ts` and `server/src/__tests__/releaseNotes.test.ts` (grouping, overdue rule, notes for finished and unfinished releases). → FR-006, FR-009, NFR-003 (AC-003, AC-004, AC-010, AC-011)

## P2 — Release API *(depends on P1)*

- [x] **T2.1 Validation chains and the create, update and delete handlers** — `validateCreateRelease`/`validateUpdateRelease`, `createRelease` (project in workspace, date order, `release.created`), `updateRelease` (archive, reopen clearing `releasedAt`, refusing `released`) and `deleteRelease` (unassigning tasks and recording the count). → FR-002, FR-003, FR-008, NFR-001 (AC-001, AC-002, AC-008, AC-009)
- [x] **T2.2 List and detail with derived progress** — `listReleases` with the project filter and the status ordering, and `getRelease` with the project, the keyed tasks and the non-epic progress, both from one task query. → FR-004, FR-005, FR-006, NFR-001 (AC-003, AC-004, AC-005)
- [x] **T2.3 Release action with the unfinished-work choice** — `validateReleaseAction` and `releaseRelease`: `unreleased` only, `moveOpenTo` resolved inside the project, the conditional status update with its 409, the move of unfinished tasks and their subtasks, one activity entry per moved task and the `{ release, movedTasks }` response. → FR-007, NFR-001 (AC-006, AC-007)
- [x] **T2.4 Release notes endpoint** — `getReleaseNotes` returns `{ markdown, groups }` or the Markdown alone with `?format=markdown` as `text/markdown`. → FR-009, NFR-001 (AC-010, AC-011)
- [x] **T2.5 Router wiring with its permissions** — `server/src/routes/releaseRoutes.ts` with the seven routes behind `protect` and `projects:read`/`projects:write`, mounted at `/:slug/releases`. → FR-001…FR-009, NFR-002 (AC-001, AC-005, AC-006, AC-010)

## P3 — Task and roadmap integration *(depends on P1)*

- [x] **T3.1 Task release assignment rules** — the `release` field on the task model and `resolveRelease`/`reconcileRelease` in `server/src/controllers/taskController.ts`, applied by the single and bulk updates with subtasks following their parent. → FR-011, NFR-001 (AC-012)
- [x] **T3.2 Roadmap release milestones** — `ReleaseMarker`, `releaseMarkers` and `describeReleaseMarker` in `client/src/features/planning/lib/roadmap.ts`, used by `RoadmapPage` to place the dated releases and open the release page. → FR-012 (AC-013)

## P4 — Releases UI *(depends on P2, P3)*

- [x] **T4.1 Client releases module: types, api and hooks** — `client/src/features/releases` with `types.ts`, `api.ts`, `index.ts` and the hooks `useReleases`, `useRelease` and `useReleaseStatus`, all through the shared axios instance. → FR-004, FR-010, NFR-002 (AC-005)
- [x] **T4.2 Releases tab, cards and dialogs** — `ReleasesTab`, `ReleaseCard`, `ReleaseStatusTag`, `ReleaseFormDialog`, `ReleaseNowDialog` and `ReleaseDialogs`. → FR-003, FR-007, FR-008, FR-010 (AC-006, AC-007, AC-008, AC-009, AC-011)
- [x] **T4.3 Release page with progress and notes** — `client/src/pages/ReleasePage.tsx` with breadcrumbs, status, dates, due line, progress ring, grouped tasks, the notes panel and the actions gated on `projects:write`. → FR-005, FR-009, FR-010 (AC-004, AC-010, AC-011)
- [x] **T4.4 Task release field and label** — `TaskReleaseField` from `releaseOptionsFor`, `TaskReleaseLabel` linking to the release page and `TaskReleaseDetail` in the task details. → FR-010, FR-011 (AC-012)
- [x] **T4.5 Client tests for the helpers, components and markers** — `lib.test.ts`, `components.test.tsx` and `roadmapMarkers.test.ts`. → FR-010, FR-012, NFR-003, NFR-004 (AC-011, AC-013)

## How this was verified (retroactive)

- `pnpm --filter server test` — TEST-001.
- `pnpm --filter server test:integration` against a local MongoDB — TEST-002, TEST-006 (CRUD, duplicate names,
  overdue, progress, task assignment rules, releasing and moving unfinished work, notes as Markdown and JSON,
  permissions and workspace isolation).
- `pnpm --filter client test` — TEST-003, TEST-004, TEST-005.
- Browser check: the Releases tab on `/{workspace}/projects/:projectId?tab=releases`, the release page at
  `/{workspace}/projects/:projectId/releases/:releaseId`, the release field and label in a task, and the release
  markers on `/{workspace}/roadmap` (empty, loading and error states; keyboard; narrow screens — CON-703).
