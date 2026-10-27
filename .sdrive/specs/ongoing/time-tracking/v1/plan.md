# Technical plan — time tracking

> **Retroactive plan** — documents the design that already exists in the codebase (onboarded 2026-10-16). Not authored upfront.

- **Feature:** `time-tracking` · **Version:** 1
- **Spec:** `.sdrive/specs/ongoing/time-tracking/v1/spec.md`
- **Governance:** `.sdrive/governance/time-tracking/v1/plan.json`

## Notation used below

- `action` on a component: `create` = module owned by this feature, `modify` = shared module this feature extends,
  `reuse` = shared module used unchanged.
- `action` on a data-model entity or field: `no_change` (no schema change is part of this feature).
- `action` on an API contract: `create` = endpoint owned by this feature, `reuse` = shared endpoint this feature
  drives (the task update that carries the estimate).

## Architecture

One document per stretch of work, one index to enforce the single timer, and pure arithmetic between the database and
the response:

```
POST /tasks/:id/time            -> validateTimeEntry -> addTimeEntry  -> TimeEntry (stopped) -> syncLogged -> task.loggedMinutes
POST /tasks/:id/timer/start     -> startTimer  -> stop+log any other timer -> TimeEntry (running, unique per user/workspace)
POST /tasks/:id/timer/stop      -> stopTimer   -> timerEnd + minutesBetween -> syncLogged
GET  /tasks/:id/time            -> estimate, loggedMinutes, caller's running entry, 500 newest entries
GET  /time                      -> timesheetFilter -> stopped entries + totals by user/day/task (5000, truncated)
GET  /time/running              -> the caller's open timer (or null)
GET  /time/export.csv           -> same filters, 20000 rows, RFC 4180 CSV with a formula guard
```

The single-timer rule lives in the database (a partial unique index on `{ workspace, user }` where `running` is true)
rather than in application state, so two racing start requests cannot create two timers. `server/src/utils/
timeTracking.ts` holds everything that can be computed without HTTP or Mongo (CON-109), and the controllers only
validate, query, call `syncLogged` and serialise. On the client, one store (`timerStore.ts`) owns the running timer for
the whole app, and everything that shows time listens to the `taskman:time-changed` window event (CON-207 for the
requests, CON-203 for the calendar days).

### Components

| Component | Action | Role |
|---|---|---|
| `server/src/models/timeEntryModel.ts` | create | TimeEntry document, `{ workspace, user, startedAt }` and `{ task }` indexes, partial unique index on running timers. |
| `server/src/utils/timeTracking.ts` | create | `minutesBetween`, `timerEnd`, `dayKey`, `parseRangeBound`, `summarizeEntries`, `formatMinutes`, `csvCell`, `toCsvRows`. |
| `server/src/controllers/timeController.ts` | create | Validation chain, `getTaskTime`, `addTimeEntry`, `startTimer`, `stopTimer`, `deleteTimeEntry`, `syncLogged`, timesheet and export handlers. |
| `server/src/routes/timeRoutes.ts` | create | `/running`, `/export.csv`, the timesheet, all with `tasks:read`. |
| `server/src/routes/taskRoutes.ts` | modify | Adds the task time and timer routes with `tasks:read`/`tasks:write` and the validation chain. |
| `server/src/routes/workspaceRoutes.ts` | modify | Mounts the time router at `/:slug/time`. |
| `server/src/controllers/taskController.ts` | modify | Accepts the estimate and keeps `loggedMinutes` on the task. |
| `server/src/utils/activity.ts` | reuse | Audit entries for logged and deleted time. |
| `client/src/features/time/timerStore.ts` | create | The shared running-timer store and the time-changed event. |
| `client/src/features/time/api.ts` | create | `forTask`, `log`, `remove`, `start`, `stop`, `running`, `timesheet`, `exportCsv`. |
| `client/src/features/time/hooks/useTaskTime.ts` | create | Entries of one task with `log`/`remove`. |
| `client/src/features/time/hooks/useRunningTimer.ts` | create | Timer snapshot, focus/visibility refresh and `useNow`. |
| `client/src/features/time/hooks/useTimesheet.ts` | create | Timesheet data for the filters, aborted on change, reloaded on the time-changed event. |
| `client/src/features/time/lib/duration.ts` | create | `parseDuration`, `formatDuration`, `describeDuration`, `formatElapsed`, `timeProgress`, `describeProgress`. |
| `client/src/features/time/lib/timesheet.ts` | create | `startOfIsoWeek`, `weekDayKeys`, `shiftWeekStart`, `weekRange`, `localDayKey`, `buildWeekGrid`, `loggedAtFor`. |
| `client/src/features/time/components/TimerPill.tsx` | create | Header timer with key, clock and stop. |
| `client/src/features/time/components/TaskTimeSection.tsx` | create | Estimate, total, progress, entries, timers, manual log, delete. |
| `client/src/features/time/components/LogTimePopover.tsx` | create | Manual entry form. |
| `client/src/features/time/components/TimeProgressBar.tsx` | create | Logged against estimated minutes. |
| `client/src/features/time/components/WeekGridTable.tsx` | create | Week grid with row, day and week totals. |
| `client/src/pages/TimesheetPage.tsx` | create | Week navigation, person filter, totals, grid and CSV export. |
| `client/src/components/AppShell.tsx` | modify | Renders `TimerPill` in the header. |

**Referenced requirements:** FR-001 … FR-012, NFR-001 … NFR-004.

## Data model

| Entity | Action | Fields (action) |
|---|---|---|
| TimeEntry | no_change | `workspace`, `task`, `user`, `startedAt`, `endedAt` (nullable), `minutes`, `note` (≤200), `running` (partial unique index on `{ workspace, user }`) — all no_change |
| Task | no_change | `estimateMinutes` (0–100000, nullable), `loggedMinutes`, `title`, `number` (nullable), `project` |
| Activity | no_change | `action` (`time.logged`, `time.deleted`), `task`, `changes` (`field: 'time'` with a formatted duration) |
| Project | no_change | `name` (join key), `key` (task key prefix, `TM` fallback) |

**Flow.** Logging by hand creates a stopped entry with whole minutes and resynchronises the task's `loggedMinutes`.
Starting a timer looks for the caller's running entry: if it points at the same task it is returned as is, otherwise
it is stopped (capped at one day, minimum one minute) and logged before a new running entry is created, which the
partial unique index guarantees can only be one per user and workspace. Stopping ends the entry, recomputes the task
total and records an audit entry. Reads have two shapes: the task view (estimate, total, the caller's running entry,
up to 500 entries) and the timesheet (stopped entries in the range with totals by user, day and task, or the same
rows as CSV).

## API contracts

| Method | Path | Action | Auth | Requirements |
|---|---|---|---|---|
| GET | `/api/workspaces/:slug/tasks/:id/time` | create | yes | FR-006, NFR-001, NFR-002 |
| POST | `/api/workspaces/:slug/tasks/:id/time` | create | yes | FR-002, FR-005, NFR-001, NFR-002 |
| DELETE | `/api/workspaces/:slug/tasks/:id/time/:entryId` | create | yes | FR-005, NFR-001, NFR-002 |
| POST | `/api/workspaces/:slug/tasks/:id/timer/start` | create | yes | FR-003, FR-001, NFR-001, NFR-002 |
| POST | `/api/workspaces/:slug/tasks/:id/timer/stop` | create | yes | FR-004, FR-005, NFR-001, NFR-002 |
| GET | `/api/workspaces/:slug/time` | create | yes | FR-007, NFR-001, NFR-002 |
| GET | `/api/workspaces/:slug/time/running` | create | yes | FR-008, NFR-001, NFR-002 |
| GET | `/api/workspaces/:slug/time/export.csv` | create | yes | FR-009, NFR-001, NFR-002 |
| PATCH | `/api/workspaces/:slug/tasks/:id` | reuse | yes | FR-011, NFR-001 |

Permission area/action: `tasks:read` for reads (including the timesheet and export), `tasks:write` for logging,
timers and deletion, plus the controller-level `settings:manage` rule for other people's time.

## Security considerations

- **NFR-001 — workspace isolation (CON-106).** Every `TimeEntry` read and write carries `workspace:
  req.workspace._id`; the project filter becomes the ids of that project's tasks inside the workspace.
- **NFR-002 — authorisation before the handler (CON-512), entry rule in the controller (CON-105).** Route-level
  `requirePermission` covers the coarse rules; `deleteTimeEntry` (and the timesheet's user filter) allow only the
  author or a holder of `settings:manage`.
- **NFR-003 — input validation (CON-515, CON-516).** `validateTimeEntry` caps minutes and the note and requires either
  minutes or both timestamps; `parseRangeBound` rejects anything that is not a day key or a valid ISO instant.
- **NFR-004 — spreadsheet formula injection.** `csvCell` prefixes an apostrophe to values starting with `=`, `+`,
  `-`, `@`, tab or carriage return.

## Performance considerations

- **NFR-003.** The task total comes from one aggregate over stopped entries (never a per-entry loop), project keys are
  resolved with a single query over the distinct names, and the project filter is turned into a task id list only
  when used.
- **NFR-001.** Both reads are bounded: the task view takes the last 500 entries and the timesheet loads `limit + 1`
  rows to detect truncation.

## Dependencies

| Name | Type | Action | Notes |
|---|---|---|---|
| mongoose | library | no_change | TimeEntry documents, the partial unique index, the sum aggregation. |
| express-validator | library | no_change | `validateTimeEntry` on the task route. |
| `server/src/utils/activity.ts` | internal | no_change | Audit entries. |
| `client/src/utils/api.ts` | internal | no_change | CON-207: shared axios instance, including the blob download. |
| `client/src/features/tasks` | internal | no_change | Task list/detail host the time section; `lib/date` for calendar days. |

## Risks

| Risk | Mitigation |
|---|---|
| The denormalised `loggedMinutes` can go stale. | Every mutating path calls `syncLogged`, which recomputes from the entries and returns the total. |
| A forgotten timer keeps running with the browser closed. | One-day cap, always-visible header pill, and starting another timer stops the previous one. |
| UTC totals and local grid days can disagree near midnight. | The grid uses the local day (`localDayKey`) and the week range is built from local week boundaries, so entries stay in scope. |

## Verification

Suites are listed under *Verification (retroactive)* in the spec (TEST-001 … TEST-006): `pnpm --filter server test`
for the pure helpers, `pnpm --filter server test:integration` against a local MongoDB for the endpoints, permissions
and the timesheet/export, and `pnpm --filter client test` for the duration helpers, the week grid and the time UI.
Full gate: `pnpm --filter server typecheck && pnpm --filter server test`, `pnpm --filter client typecheck &&
pnpm --filter client test && pnpm --filter client lint`, `pnpm --filter client build` (CON-402).
