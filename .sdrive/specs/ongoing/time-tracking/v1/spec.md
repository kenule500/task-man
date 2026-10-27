# Time tracking: timers, manual entries, task time and a weekly timesheet with CSV export

> **Retroactive specification** — documents behaviour that already exists in the codebase (onboarded 2026-10-16). Not authored upfront.

- **Feature:** `time-tracking`
- **Version:** 1
- **Governance:** `.sdrive/governance/time-tracking/v1/spec.json`
- **Status:** complete — every requirement below is implemented and covered by tests

## Overview

**Problem.** Tasks carried a story-point estimate, but nobody could see how much time the work actually took, who
spent it and on which day. Without that, estimates never improve, a weekly report has to be assembled by hand, and a
team cannot tell a ten-minute fix from a two-day investigation. Time had to be captured with as little friction as
possible, next to the work, and it had to be exportable for whoever needs the figures outside the app.

**Solution.** A `TimeEntry` document (`server/src/models/timeEntryModel.ts`) records one stretch of work: whole
minutes, a start, an optional end, a note and a `running` flag for the caller's open timer. Time is logged by hand
(minutes, or a start and an end) or produced by a timer started from the task or from the header pill. The task's
`loggedMinutes` is recomputed from its stopped entries on every change. `GET /api/workspaces/:slug/time` returns the
timesheet with totals per person, day and task, and `/time/export.csv` writes the same rows as RFC 4180 CSV with a
formula-injection guard.

**Target audience.** Individual contributors logging their own time and running a timer while they work, and team
leads or workspace administrators reviewing a week for one person or the whole team and exporting it.

### Assumptions

1. *assumption: true* — time is recorded in whole minutes; a timer stopped immediately still counts one minute.
2. *assumption: true* — the server groups days by the UTC calendar day of the entry's start, while the weekly grid on
   the client groups by the viewer's local calendar day; an entry logged late in the evening can appear under a
   different day in the two views.
3. *assumption: true* — the running timer is deliberately kept out of every total: timesheets and exports contain
   stopped entries only, and the open timer is reported by `/time/running`.
4. *assumption: true* — a timer left running is capped at one day (1440 minutes) rather than growing without bound.

### Out of scope

- Approval workflows and period locking for timesheets.
- Billing rates, billable flags and invoicing; the export is plain CSV.
- Comparing estimates across tasks or reporting estimate accuracy.
- Absence, holiday or capacity calendars.

## User stories

### US-001 — Log time on a task by hand
As a **team member** I want **to record the minutes I spent, with an optional start time and a note** so that **the
work is visible on the task even when I forgot to run a timer**.

- **AC-001** A manual entry is created from either minutes (1–1440) with an optional start and note, or from a start
  and an end; the entry is stored stopped and the response returns it with the task's new `loggedMinutes`.
  (`addTimeEntry`)
- **AC-002** With a start and an end, the length must be at least one and at most 1440 minutes; otherwise HTTP 400
  with a message stating that limit.
- **AC-003** Minutes outside 1–1440 and a note longer than 200 characters are refused with HTTP 400 by the validation
  chain. (`validateTimeEntry`, `MAX_TIME_NOTE_LENGTH`)
- **AC-004** A start more than one day in the future is refused with HTTP 400 "You cannot log time more than a day
  ahead."

### US-002 — Run a timer while I work
As a **team member** I want **to start a timer on the task I am working on and stop it when I switch** so that **I do
not have to remember how long I worked**.

- **AC-005** Starting a timer creates a running entry (`endedAt` null, `minutes` 0); starting again on the same task
  returns the entry already running instead of creating a second one. (`startTimer`)
- **AC-006** A user has at most one running timer per workspace: starting one while another runs stops and logs the
  previous entry first and returns both the new entry and the stopped one.
- **AC-007** Stopping the timer ends it at the current time, capped at 1440 minutes after it started and at least one
  minute long. (`timerEnd`, `minutesBetween`)

### US-003 — See logged time against the estimate on a task
As a **team member** I want **the estimate, the logged total, my running timer and the individual entries** so that
**I can tell whether the task is over or under its estimate without leaving the task**.

- **AC-008** The task time endpoint returns the estimate in minutes (or null), the task's `loggedMinutes`, the
  caller's running entry (or null) and up to 500 entries newest first with the user who logged them. (`getTaskTime`)
- **AC-009** Deleting is allowed for the author and for a role holding `settings:manage`; anyone else receives HTTP
  403 "You can only delete your own time entries". After logging, stopping or deleting, `loggedMinutes` equals the sum
  of the stopped entries. (`deleteTimeEntry`, `syncLogged`)

### US-004 — Review a week of time
As a **team lead** I want **a timesheet for a date range, per person or for the whole workspace, with totals** so
that **I can see where the week went**.

- **AC-010** The timesheet returns the entries of the range with totals overall and per user, per day and per task; a
  caller without `settings:manage` only ever receives their own entries. (`timesheetFilter`)
- **AC-011** A project filter limits the timesheet to entries on tasks of that project, and the response sets
  `truncated` when more entries exist than the page limit, returning the newest 5000.

### US-005 — Export a timesheet as CSV
As a **team lead** I want **to download the same figures as a CSV file** so that **I can hand the numbers to a
spreadsheet**.

- **AC-012** The export answers as `text/csv` with a UTF-8 byte-order mark, one row per entry and the columns Date,
  User, Task key, Task, Project, Started, Ended, Minutes, Hours, Note, offered for download with the workspace slug
  and the day in the filename. (`exportTimesheet`)
- **AC-013** The export honours the same filters as the timesheet, accepts at most 20000 entries, and every field is
  quoted with inner quotes doubled; text a spreadsheet could run as a formula gets a leading apostrophe. (`csvCell`)

## Functional requirements

| ID | Requirement | Acceptance criteria |
|---|---|---|
| FR-001 | `TimeEntry` stores workspace, task, user, `startedAt`, `endedAt` (null while running), whole `minutes`, a ≤200-character note and `running`, with the indexes `{ workspace, user, startedAt }` and `{ task }` and a partial unique index on `{ workspace, user }` where `running` is true. | AC-005, AC-006 |
| FR-002 | `POST /tasks/:id/time` logs by hand: minutes (1–1440, optional `startedAt` defaulting to now minus those minutes) or `startedAt` with `endedAt` (length 1–1440 minutes, 400 otherwise); the chain requires either minutes or both timestamps and caps the note; a start more than a day ahead is refused. Responds 201 with `{ entry, loggedMinutes }`. | AC-001, AC-002, AC-003, AC-004 |
| FR-003 | `POST /tasks/:id/timer/start` returns the entry already running on that task, otherwise stops and logs any timer running elsewhere for that user and creates a running entry, answering 201 with `{ entry, stopped }`. | AC-005, AC-006 |
| FR-004 | `POST /tasks/:id/timer/stop` ends the caller's timer: `timerEnd` caps the end at start + 1440 minutes and `minutesBetween` returns rounded whole minutes, at least 1 and at most the cap; without a running timer it answers 404 "No timer is running on this task". | AC-007 |
| FR-005 | `syncLogged` recomputes the task's `loggedMinutes` from its stopped entries after every log, stop and delete and returns it; `deleteTimeEntry` allows the author or `settings:manage` (403 otherwise) and records a `time.deleted` activity entry with the duration. | AC-009 |
| FR-006 | `GET /tasks/:id/time` returns `estimateMinutes` (null when unset), the task's `loggedMinutes`, the caller's running entry and at most 500 entries newest first with the user populated from `PUBLIC_USER_FIELDS`. | AC-008 |
| FR-007 | `GET /time` filters stopped entries by `startedAt` between `from` and `to` (a bare `YYYY-MM-DD` `to` covers the whole day), by user only for `settings:manage` (everyone else is forced to their own id) and by project through that project's task ids, returning entries with the task key plus totals overall, by user (with names), by day and by task, and `truncated` when the 5000-row limit is exceeded. | AC-010, AC-011 |
| FR-008 | `GET /time/running` returns the caller's running entry with its task key, or `{ entry: null }` when no timer runs, so the header pill and the task dialog share one source of truth. | AC-005 |
| FR-009 | `GET /time/export.csv` reuses the filter logic with a 20000-row limit and writes `text/csv` with a UTF-8 BOM, the header Date, User, Task key, Task, Project, Started, Ended, Minutes, Hours, Note and one row per entry; `csvCell` quotes every field, doubles inner quotes and prefixes an apostrophe to values starting with `=`, `+`, `-`, `@`, tab or carriage return, and the file is named `timesheet-<slug>-<day>.csv`. | AC-012, AC-013 |
| FR-010 | The client keeps the caller's running timer in one store (`timerStore.ts`: `subscribeTimer`, `getTimerSnapshot`, `refreshTimer`, `selectWorkspace`, `startTimer`, `stopTimer`, `notifyTimeChanged`, `TIME_CHANGED_EVENT`), and `TimerPill` renders it in the header with the task key, the elapsed clock and a stop button. | AC-005, AC-006 |
| FR-011 | `TaskTimeSection` shows the editable estimate (`parseDuration` accepts "2h 30m", "90m", "1.5h", "1:30" or bare minutes, capped at `MAX_ESTIMATE_MINUTES` = 100000), the logged total, the progress bar, the entries, start/stop, the manual log popover and deletion; `useTaskTime` and `useRunningTimer` reload on the time-changed event and on focus. | AC-003, AC-008, AC-009 |
| FR-012 | `TimesheetPage` shows one Monday-based week at a time (`startOfIsoWeek`, `weekDayKeys`, `shiftWeekStart`, `weekRange`), builds the grid with `buildWeekGrid` from the entries and their local day (`localDayKey`), lets a manager pick a person, and downloads the export blob from `/time/export.csv`. | AC-010, AC-012, AC-013 |

## Non-functional requirements

| ID | Requirement |
|---|---|
| NFR-001 | Every time query is scoped to one workspace (CON-106): entries and the task lookup carry `workspace: req.workspace._id`, and the project filter resolves task ids inside that workspace only. |
| NFR-002 | Routes are permission scoped (CON-512): `tasks:read` for reads and `tasks:write` for logging, timers and deletion; seeing other people's time and deleting someone else's entry additionally requires `settings:manage`, which the controller checks because it depends on the entry's author (CON-105). |
| NFR-003 | The arithmetic is pure and unit tested (CON-109, CON-202, CON-402): `server/src/utils/timeTracking.ts` and the client helpers `lib/duration.ts` and `lib/timesheet.ts` have Jest suites. |
| NFR-004 | Calendar-day handling follows CON-203: a bare `YYYY-MM-DD` range bound is accepted (a `to` bound covers that whole UTC day) and the client builds its week from local calendar-day keys through `@/features/tasks/lib/date`, mapping entries back with `localDayKey`. |

Non-functional requirements carry no acceptance criteria of their own: they are enforced by the constitution rules
above and verified by the suites listed in *Verification*.

## Edge cases

| ID | Situation | Expected behaviour |
|---|---|---|
| EC-001 | Two start requests for the same user and workspace arrive together. | The partial unique index on `{ workspace, user }` where `running` is true lets only one running entry exist. |
| EC-002 | A stop is requested with no running timer. | HTTP 404 "No timer is running on this task"; a concurrent stop that loses the race gets the same answer because the update is conditional on `running: true`. |
| EC-003 | A timer is left running for days. | Capped at 1440 minutes: `timerEnd` limits the end to start + one day and `minutesBetween` caps the value. |
| EC-004 | A manual entry ends before it starts or spans more than a day. | HTTP 400 "The end must be after the start, at most 1440 minutes later". |
| EC-005 | A manual entry starts more than a day in the future. | HTTP 400 "You cannot log time more than a day ahead". |
| EC-006 | An entry refers to a task or user deleted after the fact. | The row is dropped from the timesheet (`loadSheet` filters entries without a populated task or user), so totals and the export never count work that no longer exists. |
| EC-007 | More entries in the range than the page limit. | The timesheet returns the newest 5000 with `truncated: true`; the export accepts up to 20000 and is cut beyond that. |
| EC-008 | A timer is running while the timesheet is requested. | The open timer is never part of the totals or the export (`running: { $ne: true }`); it is reported by `/time/running`. |

## Dependencies

| Name | Type | Notes |
|---|---|---|
| `server/src/utils/activity.ts` | internal | `recordActivity` writes the `time.logged`/`time.deleted` entries; `auditLookup` resolves the task title. |
| `client/src/features/tasks` | internal | Task list and detail supply the estimate field and host the time section; `lib/date` gives the calendar-day helpers. |
| `client/src/utils/api.ts` | internal | CON-207: `timeApi` uses the shared axios instance, including the blob download. |
| mongoose | library | TimeEntry documents, the partial unique index and the aggregation behind `syncLogged`. |
| express-validator | library | `validateTimeEntry` declared on the task route. |

## Risks

| ID | Risk | Mitigation |
|---|---|---|
| RISK-001 | `loggedMinutes` is denormalised, so a write outside the controller leaves the task total stale. | Every mutating path calls `syncLogged`, which always recomputes from the entries and returns the total. |
| RISK-002 | A closed tab leaves a timer running. | The one-day cap bounds the entry, the header pill shows the timer everywhere, and starting another timer stops the previous one. |
| RISK-003 | UTC days (server) and local days (client) can disagree near midnight. | The grid groups by the viewer's local day while server totals group by UTC day; the weekly range is built from local week boundaries so entries stay in scope either way. |

## Verification (retroactive)

| Test id | File | Command |
|---|---|---|
| TEST-001 | `server/src/__tests__/timeTracking.test.ts` | `pnpm --filter server test` |
| TEST-002 | `server/src/__integration__/time.test.ts` | `pnpm --filter server test:integration` |
| TEST-003 | `client/src/features/time/__tests__/duration.test.ts` | `pnpm --filter client test` |
| TEST-004 | `client/src/features/time/__tests__/timesheet.test.ts` | `pnpm --filter client test` |
| TEST-005 | `client/src/features/time/__tests__/timeUi.test.tsx` | `pnpm --filter client test` |
| TEST-006 | `server/src/__integration__/rbac.test.ts` | `pnpm --filter server test:integration` |

Integration tests need a local MongoDB (`MONGO_URI=mongodb://127.0.0.1:27017/task-man`, CON-407). Full gate:
`pnpm --filter server typecheck && pnpm --filter server test`, `pnpm --filter client typecheck && pnpm --filter
client test && pnpm --filter client lint`, `pnpm --filter client build` (CON-402). Browser check: a task dialog
(estimate, log, timer, delete), the header pill while a timer runs and the timesheet at `/{workspace}/timesheet` with
week navigation, a person filter and the CSV export (empty, loading and error states; keyboard; narrow screens —
CON-703).
