# Execution tasks — time tracking

> **Retroactive task list** — every task below is already implemented and merged; the list records the work that
> produced the behaviour in `.sdrive/specs/ongoing/time-tracking/v1/spec.md` (onboarded 2026-10-16). Not authored upfront.

- **Feature:** `time-tracking` · **Version:** 1
- **Governance:** `.sdrive/governance/time-tracking/v1/tasks.json`
- All tasks are `completed: true`; the checkbox state mirrors `tasks.json`.

## P1 — Entry model and pure helpers

- [x] **T1.1 TimeEntry model with the single-timer index** — `server/src/models/timeEntryModel.ts`: workspace, task, user, `startedAt`, `endedAt`, `minutes`, `note`, `running`, the `{ workspace, user, startedAt }` and `{ task }` indexes and the partial unique index on `{ workspace, user }` where `running` is true. → FR-001, NFR-001 (AC-005, AC-006)
- [x] **T1.2 Pure time tracking helpers and their tests** — `server/src/utils/timeTracking.ts` (`minutesBetween`, `timerEnd`, `dayKey`, `parseRangeBound`, `summarizeEntries`, `formatMinutes`, `csvCell`, `toCsvRows`) with `server/src/__tests__/timeTracking.test.ts`. → FR-004, FR-009, NFR-003, NFR-004 (AC-007, AC-012, AC-013)

## P2 — Task-scoped endpoints *(depends on P1)*

- [x] **T2.1 Manual logging with its validation chain** — `addTimeEntry` and `validateTimeEntry`: minutes or start plus end, the 1440-minute ceiling, the 200-character note, the future-start guard and the 201 response with `entry` and `loggedMinutes`. → FR-002, NFR-001 (AC-001, AC-002, AC-003, AC-004)
- [x] **T2.2 Timer start and stop with the one-timer rule** — `startTimer` stops and logs a timer running elsewhere and returns the entry already running on the same task; `stopTimer` ends the entry with the 1440-minute cap and a minimum of one minute; the racing case is handled by the partial unique index. → FR-003, FR-004, FR-001 (AC-005, AC-006, AC-007)
- [x] **T2.3 Task total resync, deletion rules and the task time read** — `syncLogged` recomputes `loggedMinutes` after log, stop and delete; `deleteTimeEntry` allows the author or `settings:manage` and logs `time.deleted`; `getTaskTime` returns the estimate, the total, the caller's running entry and up to 500 entries. → FR-005, FR-006, NFR-001 (AC-008, AC-009)
- [x] **T2.4 Route wiring on the tasks router** — `GET`/`POST /:id/time`, `POST /:id/timer/start`, `POST /:id/timer/stop` and `DELETE /:id/time/:entryId` on `server/src/routes/taskRoutes.ts` with `tasks:read`/`tasks:write` and the validation chain. → FR-002…FR-006, NFR-002 (AC-001, AC-005, AC-007, AC-009)

## P3 — Timesheet and export *(depends on P1, P2)*

- [x] **T3.1 Timesheet filters, totals and limits** — `timesheetFilter` and `loadSheet`: range bounds, the user filter for `settings:manage`, the project filter through task ids, the stopped-only rule, the 5000-row limit with `truncated`, and totals by user, day and task with one project-key query. → FR-007, NFR-001 (AC-010, AC-011)
- [x] **T3.2 Running timer endpoint** — `getRunningTimer` returns the caller's running entry with its task key, or `{ entry: null }`. → FR-008, NFR-001 (AC-005)
- [x] **T3.3 CSV export with the formula guard** — `exportTimesheet` reuses the filter logic with a 20000-row limit and writes the ten-column CSV with a UTF-8 byte-order mark, quoting through `csvCell`, named after the workspace slug and the day. → FR-009, NFR-004 (AC-012, AC-013)
- [x] **T3.4 Workspace time router** — `server/src/routes/timeRoutes.ts` with `/running`, `/export.csv` and the timesheet at the root, mounted at `/:slug/time` from `workspaceRoutes.ts` behind `protect` and `requirePermission('tasks:read')`. → FR-007, FR-008, FR-009, NFR-002 (AC-010, AC-012)

## P4 — Time tracking UI *(depends on P2, P3)*

- [x] **T4.1 Duration helpers and the shared timer store** — `client/src/features/time/lib/duration.ts` and `timerStore.ts` (`subscribeTimer`, `getTimerSnapshot`, `refreshTimer`, `selectWorkspace`, `startTimer`, `stopTimer`, `notifyTimeChanged`, `TIME_CHANGED_EVENT`). → FR-010, FR-011, NFR-003 (AC-005, AC-006, AC-007)
- [x] **T4.2 Time section in the task dialog** — `TaskTimeSection.tsx` with the estimate field, logged total, `TimeProgressBar`, entry list, start/stop, `LogTimePopover` and deletion, backed by `useTaskTime` and `useRunningTimer`. → FR-011, FR-005 (AC-003, AC-008, AC-009)
- [x] **T4.3 Header timer pill** — `TimerPill.tsx` with the task key, the elapsed clock and the stop button, hidden without a timer or `tasks:read`. → FR-010, NFR-002 (AC-005, AC-006)
- [x] **T4.4 Weekly timesheet page with CSV download** — `TimesheetPage.tsx` with week navigation, the person filter for managers, `WeekGridTable` built by `buildWeekGrid`, totals and the export button downloading the blob. → FR-012, FR-007, FR-009, NFR-004 (AC-010, AC-012, AC-013)
- [x] **T4.5 Client tests for the helpers and the UI** — `client/src/features/time/__tests__/duration.test.ts`, `timesheet.test.ts` and `timeUi.test.tsx`. → FR-011, FR-012, NFR-003 (AC-003, AC-008, AC-009, AC-010)

## How this was verified (retroactive)

- `pnpm --filter server test` — TEST-001.
- `pnpm --filter server test:integration` against a local MongoDB — TEST-002, TEST-006.
- `pnpm --filter client test` — TEST-003, TEST-004, TEST-005.
- Browser check: a task dialog (estimate, manual log, timer start/stop, delete), the header pill while a timer runs,
  and `/{workspace}/timesheet` with week navigation, a person filter and the CSV export (empty, loading and error
  states; keyboard; narrow screens — CON-703).
