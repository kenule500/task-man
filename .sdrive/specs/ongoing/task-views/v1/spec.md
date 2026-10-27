> **Retroactive specification** — documents behaviour that already exists in the codebase (onboarded 2026-10-16). Not authored upfront.

# task-views — functional specification

| | |
|---|---|
| Feature | `task-views` |
| Version | 1 |
| Status | Retroactive (behaviour already shipped and verified by the tests listed below) |
| Governance | `.sdrive/governance/task-views/v1/{spec,plan,tasks,traceability}.json` |

## 1. Overview

### Problem statement

One task list is not enough: a team plans in columns, schedules on a calendar, checks the critical path on a Gantt and trims details in a
dense table. Four separate screens would duplicate filtering, permissions and data loading — and they would drift apart the moment a rule
changes.

### Proposed solution

Four interchangeable views behind one contract: `client/src/features/tasks/views/types.ts` defines `TaskViewProps`, and every view receives its
tasks and callbacks from the page, which reads them from the single `useTasks` hook. Non-visual rules live in
`client/src/features/tasks/lib/` and are unit tested there; the view, the filters and the board's own controls are kept in the URL, so any
state is shareable as a link.

### Target audience

Workspace members and administrators planning work in TaskMan, on desktop and on phones.

### Assumptions

- Visual details (spacing, colours, iconography) follow `DESIGN.md` and `docs/DESIGN_SYSTEM.md` and are not restated here; only behaviour is
  specified. `assumption: true`
- The saved-views menu and the URL-filter hook come from the separate views feature (`client/src/features/views/hooks/useUrlFilters.ts`) —
  reused, not owned by this feature. `assumption: true`
- Motion comes from the `motion` package already used by the board (`motion/react`, `MotionProvider`); no new UI library was introduced. `assumption: true`

### Out of scope

- Saved views (`client/src/features/views`, `/api/workspaces/:slug/views`) — a separate feature.
- The Gantt draws and marks dependency conflicts but does not edit dependencies; that happens in the task form and the relations panel.
- Time tracking and the flow reports over the same data are separate features.

## 2. User stories and acceptance criteria

### US-001 — Plan the sprint on a board with drag and drop
*As a* workspace member *I want* one column per workflow stage, drag and drop between them, and my own work visible,
*so that* the state of the sprint is obvious at a glance.

- **AC-001** One column per workflow stage with its name, colour dot and card count; a task whose stored `stage` no longer belongs to its
  `status` group is shown in the first stage of that group (`resolveStage` in `client/src/features/workflow/lib/stages.ts`,
  `groupByStage`, `BoardView.tsx`).
- **AC-002** Dropping a card on another column or position saves a patch with the target stage (or its `status` when the workflow is not
  loaded — `stagePatch`) and a fractional `position` between its new neighbours (`getDropPosition`, `positionBetween` in `lib/filters.ts`);
  a drop that changes nothing sends no request (`getDropPosition` returns `null`).
- **AC-003** Epics are containers, never cards: `withoutEpics` keeps them out of the columns while their items are shown (and lanes can group
  by epic).
- **AC-022** Swimlane grouping splits the board into lanes by assignee, project, type or epic on desktop only
  (`groupIntoSwimlanes`, `SWIMLANE_GROUPS` in `lib/swimlanes.ts`); each task sits in exactly one lane (its first assignee, project, type or
  epic), empty buckets such as `Unassigned` come last, and grouping is off on phones (`laneMode = groupBy !== 'none' && isDesktop`).
- **AC-023** A column header shows its card count and, when the stage has a WIP limit, `count / limit` with a warning style while over it
  (`wipCountLabel`, `isOverWip` in `lib/wip.ts`); the limit is soft — nothing is blocked and a card can still be moved in.
- **AC-024** A column renders the first ten cards and a "Show more" action that reveals ten more (`BOARD_PAGE_SIZE`, `paginate`, `pageCount`
  in `lib/pagination.ts`).

### US-002 — Move work on a phone without dragging
*As a* workspace member on a phone *I want* to switch columns with a swipe or a tab and move a card with one tap or from a sheet,
*so that* I can run stand-up from my phone without fighting drag and drop.

- **AC-004** Below the `md` breakpoint the board shows one column at a time behind a sticky segmented switcher whose tab carries the column
  count (Pending first), and the selected stage is kept in `?col=` (first stage when absent or unknown — `useBoardUrlState`).
- **AC-005** A one-finger horizontal swipe past the 60 px threshold moves to the next column (swipe left) or the previous one (swipe right);
  shorter swipes, mostly vertical scrolls and multi-finger gestures are ignored, and nothing happens from `md` up where all columns are
  visible (`SWIPE_THRESHOLD`, `swipeStep`, `stepColumn` in `lib/columnSwipe.ts`).
- **AC-006** Every card shows a labelled quick action for the next stage (`Start`, `Next`, `Done`, `Reopen` — `quickMoveFor` in
  `workflow/lib/stages.ts`) and offers a "Move to" sheet from its menu; a 500 ms long press (`LONG_PRESS_MS`, cancelled when the finger moves
  or lifts early, mouse ignored) opens the same sheet (`MoveTaskSheet.tsx`).
- **AC-007** The column tabs answer Arrow keys, Home and End, and the incoming column's slide transition is skipped when
  `prefers-reduced-motion` is set (`SLIDE_MS`, `SLIDE_MS` gated in `BoardView.tsx`).

### US-003 — Manage tasks in a dense list
*As a* workspace member *I want* to edit fields in place, choose which columns I see and act on several rows at once,
*so that* triage is fast and a small change never needs a dialog.

- **AC-008** The list renders a desktop grid table and compact phone cards for the same tasks, keeping the task key, the badges (priority,
  due date, type, points, time, subtask progress) and the actions menu on both.
- **AC-009** Title, due date, status and priority are edited in place (`InlineText`, `InlineDate`, `StatusSelect`, `PrioritySelect`); with
  `canWrite` false the editors are read-only and the done button is disabled.
- **AC-010** The Columns menu switches the optional built-in columns and one column per active custom field, the choice is remembered per
  workspace (`readListColumns`/`writeListColumns` in `client/src/utils/preferences.ts`), and clicking the header of a custom number or date
  column sorts ascending, then descending, then back to the list's own order (`isSortableColumn`, `nextColumnSort`, `sortByColumn` in
  `lib/listColumns.ts`).
- **AC-011** When bulk handlers and permissions allow it, each row gets a selection checkbox: Shift+click selects the range from the last
  clicked row, the header checkbox toggles the visible rows (indeterminate in between), Esc clears the selection, and the bulk bar applies one
  patch or asks before deleting the selection (`lib/selection.ts`, `BulkActionBar.tsx`).

### US-004 — Schedule work on the calendar
*As a* workspace member *I want* to see what is due when, move a task to another day and add a task on a day,
*so that* deadlines are planned against real days instead of an ordered list.

- **AC-012** The month grid always shows six full weeks starting on Sunday (`buildMonthGrid`), places tasks on their due day, marks days
  outside the month and today, and dropping a task on another day reschedules it keeping its duration (`rescheduleToDeadline`, `shiftTask`);
  an empty day offers "add a task" prefilled with that day when the user may write.
- **AC-013** Each day shows up to three urgency-ordered dots (overdue first) plus a `+N` overflow and a plain-text summary for assistive tech
  (`dotStateOf`, `summarizeDay`, `MAX_DOTS` = 3 in `lib/calendarDots.ts`), with a legend naming the dot colours.
- **AC-014** Phones get a week strip or a compact month grid (remembered in localStorage under `taskman.calendar.mobileMode` —
  `readMobileMode`/`writeMobileMode` in `lib/week.ts`) plus an "Upcoming" list of the days that have tasks (`buildUpcoming`); "Today" returns
  to the current month, selects, scrolls to and focuses today, and the `t` shortcut does the same except while typing in a field or dialog
  (`isTypingTarget`).

### US-005 — Review the schedule on the Gantt timeline
*As a* workspace member *I want* bars, dependency arrows and conflicts, and to nudge dates directly,
*so that* the critical path and its slips are visible without exporting anything.

- **AC-015** Bars run from the start date (or the deadline for one-day tasks — `getStartKey`) to the deadline, rows are sorted by start, the
  header groups consecutive days by month (`groupDaysByMonth`), and the chart opens scrolled to today and zooms by day on desktop or by week
  on phones (`ZOOM_LEVELS`, `getInitialZoom`).
- **AC-016** An elbow arrow is drawn from each prerequisite's bar to its dependant's bar (`getLinkPath`), and a dependant starting before its
  prerequisite is due is counted as a conflict (`conflict` on `TimelineLink`) and highlighted.
- **AC-017** A bar can be dragged to move it or grabbed at its right edge to resize it, and the same is possible with Arrow keys and
  Shift+Arrow; while a drag is in progress live refreshes are held (`useLiveHold(drag !== null)`) so the bars do not move under the pointer.

### US-006 — Share the exact view with a link
*As a* workspace member *I want* the view, the filters and the board state to live in the URL,
*so that* I can paste a link that opens what I was looking at.

- **AC-018** `?view=` selects list, board, calendar or timeline (`TASK_VIEWS` in `client/src/features/tasks/constants.ts`); switching views
  keeps every filter parameter and drops the rest (`isFilterParam`).
- **AC-019** Filters round-trip as `q`, `status`, `priority`, `type`, `label`, `epic`, `project`, `sprint`, `release`, `assignedToMe`, `sort`
  and `cf.<key>` (at most five) with safe fallbacks for missing or unknown values (`parseFilterParams`, `serializeFilters`,
  `withFilterParams` in `lib/filters.ts`); a label or epic filter whose target no longer exists falls back to `all` in `TaskPage.tsx`.
- **AC-020** The board keeps `?col=`, `?qf=` and `?group=` in the URL: quick filters and the grouping are parsed in canonical order with
  unknown values dropped (`parseQuickFilters`, `parseSwimlaneGroup`); a column change pushes a history entry so Back returns to the previous
  column, and filter/grouping changes replace the entry (`useBoardUrlState`).
- **AC-021** Views show an empty state that tells "no tasks yet" apart from "no matches" (driven by `totalCount`) and hide write or delete
  affordances when the user lacks `tasks:write` or `tasks:delete` (`canWrite`, `canDelete`).

## 3. Functional requirements

| ID | Requirement | Evidence in the repository |
|---|---|---|
| FR-001 | Every view implements `TaskViewProps` and receives tasks and callbacks from the page; no view fetches. | `views/types.ts`, `views/*.tsx`, `index.ts`, `pages/TaskPage.tsx` (CON-111) |
| FR-002 | The board groups tasks into one column per workflow stage, excludes epics and writes drops as a stage/status patch plus a fractional position. | `views/BoardView.tsx`, `workflow/lib/stages.ts` (`groupByStage`, `stagePatch`), `lib/filters.ts` (`getDropPosition`, `positionBetween`) |
| FR-003 | On phones the board shows one column at a time with `?col=`, swipe and keyboard navigation, and moves a card through a labelled quick action or the Move-to sheet. | `views/BoardView.tsx`, `components/MoveTaskSheet.tsx`, `lib/columnSwipe.ts`, `hooks/useBoardSettings.ts` |
| FR-004 | Quick filters (My tasks, Bugs, Due this week, Blocked, Unassigned) are AND-combined and kept in `?qf=`; swimlanes group by assignee, project, type or epic on desktop. | `lib/boardQuickFilters.ts`, `lib/swimlanes.ts`, `components/BoardQuickFilters.tsx`, `components/BoardSwimlanes.tsx` |
| FR-005 | Each column shows its count and `count / limit` with an over-limit warning that never blocks, and paginates its cards at ten. | `lib/wip.ts`, `lib/pagination.ts`, `components/WipLimitsDialog.tsx`, `hooks/useBoardSettings.ts` |
| FR-006 | The list renders a table and phone cards, edits in place under `canWrite`, remembers columns per workspace and sorts by a custom number or date column. | `views/ListView.tsx`, `lib/listColumns.ts`, `components/ListColumnsMenu.tsx`, `components/InlineEdit.tsx` |
| FR-007 | The list offers multi-select (row/header checkbox, Shift+click range, Esc) and applies bulk updates or deletes behind a confirmation. | `lib/selection.ts`, `components/BulkActionBar.tsx`, `client/src/features/tasks/api.ts` (`bulkUpdate`, `bulkDelete`) |
| FR-008 | The calendar renders a six-week month grid, reschedules on drop and creates a task prefilled with the clicked day. | `views/CalendarView.tsx`, `lib/schedule.ts` (`buildMonthGrid`, `rescheduleToDeadline`) |
| FR-009 | The calendar summarises each day with three urgency dots, an overflow count and an accessible summary plus legend, and gives phones the week strip / month modes with Upcoming and Today. | `lib/calendarDots.ts`, `lib/agenda.ts`, `lib/week.ts`, `views/CalendarView.tsx` |
| FR-010 | The timeline draws Gantt bars with month segments, dependency arrows and conflict marking, and reschedules or resizes bars by pointer or keyboard. | `views/TimelineView.tsx`, `lib/schedule.ts` (`buildTimeline`, `getLinkPath`), `features/live/hooks/useLiveHold.ts` |
| FR-011 | The selected view, the filters and the board controls are kept in the URL through tested parse/serialize helpers with safe fallbacks. | `lib/filters.ts`, `hooks/useBoardSettings.ts`, `features/views/hooks/useUrlFilters.ts` |
| FR-012 | Views distinguish an empty workspace from a filtered-out result set and hide write/delete affordances for members who lack the permission. | `pages/TaskPage.tsx`, `components/ds` `EmptyState`, `canWrite`/`canDelete` in `views/types.ts` |

## 4. Non-functional requirements

| ID | Requirement | Constitution |
|---|---|---|
| NFR-001 | Views implement `TaskViewProps` and read data through `useTasks`, the single source of truth with optimistic updates; `canWrite`/`canDelete` only hide affordances because the server keeps enforcing the permissions. | CON-111, CON-105 |
| NFR-002 | Interactive UI is keyboard operable and exposes accessible names: column tabs (Arrow/Home/End), Gantt bars (Arrow, Shift+Arrow), Esc clears the selection, calendar dots are hidden from assistive tech behind a text summary, and the priority indicator carries a screen-reader label. | CON-305 |
| NFR-003 | Scheduling works on calendar days through `lib/date.ts` (`parseDateKey`, `toDateKey`, `dateKeyOf`), never through `new Date('YYYY-MM-DD')` for display. | CON-203 |
| NFR-004 | Layouts are mobile-first: one board column at a time on phones, phone cards instead of the list table, week zoom by default on the Gantt. | CON-306 |

## 5. Edge cases

| ID | Case | Expected behaviour |
|---|---|---|
| EC-001 | A card is dropped exactly where it already was. | `getDropPosition` returns `null`; no request is sent. |
| EC-002 | A live refresh answers while a Gantt bar is dragged. | `useLiveHold(drag !== null)` pauses the refresh so the bars cannot jump. |
| EC-003 | `?col=`, `?group=` or `?qf=` carry an unknown value. | Fall back to the first stage, `group=none` and no quick filters; the invalid value is not written back. |
| EC-004 | A label or epic filter points at something that no longer exists. | `TaskPage` falls back to `all` for that filter instead of showing an empty list. |
| EC-005 | A filter or a delete hides rows that were selected. | `pruneSelection` drops the ids that are no longer visible, so the bulk bar cannot act on an invisible row. |
| EC-006 | Empty workspace versus filters that match nothing. | Two distinct empty states driven by `totalCount`. |
| EC-007 | `localStorage` is unavailable (private mode, sandboxed frame). | `readMobileMode`/`writeMobileMode` wrap storage access and fall back to the week strip without throwing. |
| EC-008 | The user prefers reduced motion. | The column slide transition is skipped and scrolling uses `auto` (`lib/scroll.ts`). |
| EC-009 | A member without `tasks:write` opens a board, calendar or timeline. | Drag is disabled, quick actions are hidden, inline editors are read-only; the API still rejects any write attempt. |

## 6. Dependencies and risks

Dependencies: `react-router-dom` (URL state), `motion`, `lucide-react`, Tailwind v4, and the internal `useTasks`, `features/workflow`,
`features/fields` and `features/views` modules; the server side is `GET|PUT /api/workspaces/:slug/board-settings`.

| Risk | Mitigation |
|---|---|
| RISK-001 Three interaction models (native DnD, pointer events, touch) are easy to break on one device class. | Every gesture has a keyboard or button equivalent, and each has a dedicated test file (`board.test.tsx`, `calendar.test.tsx`, `columnSwipe.test.ts`, `views.test.tsx`). |
| RISK-002 A large workspace could make the board and list slow. | Memoised columns/rows, per-column pagination, one fractional-position write per drop, and the shared cached task list. |
| RISK-003 URL state and component state can drift. | One tested parse/serialize module per concern, and the board falls back to local state when the page passes no controls. |

## 7. Verification (retroactive)

Commands:

```
pnpm --filter client test      # jsdom + Testing Library (all view and lib tests)
pnpm --filter server test      # board-settings endpoint the board depends on
```

| TEST id | Test file | Command |
|---|---|---|
| TEST-001 | `client/src/features/tasks/__tests__/views.test.tsx` | `pnpm --filter client test` |
| TEST-002 | `client/src/features/tasks/__tests__/board.test.tsx` | `pnpm --filter client test` |
| TEST-003 | `client/src/features/tasks/__tests__/calendar.test.tsx` | `pnpm --filter client test` |
| TEST-004 | `client/src/features/tasks/__tests__/boardFeatures.test.tsx` | `pnpm --filter client test` |
| TEST-005 | `client/src/features/tasks/__tests__/boardUrlState.test.tsx` | `pnpm --filter client test` |
| TEST-006 | `client/src/features/tasks/__tests__/boardQuickFilters.test.ts` | `pnpm --filter client test` |
| TEST-007 | `client/src/features/tasks/__tests__/swimlanes.test.ts` | `pnpm --filter client test` |
| TEST-008 | `client/src/features/tasks/__tests__/wip.test.ts` | `pnpm --filter client test` |
| TEST-009 | `client/src/features/tasks/__tests__/pagination.test.ts` | `pnpm --filter client test` |
| TEST-010 | `client/src/features/tasks/__tests__/selection.test.ts` | `pnpm --filter client test` |
| TEST-011 | `client/src/features/tasks/__tests__/listColumns.test.ts` and `listColumnsUi.test.tsx` | `pnpm --filter client test` |
| TEST-012 | `client/src/features/tasks/__tests__/schedule.test.ts` | `pnpm --filter client test` |
| TEST-013 | `client/src/features/tasks/__tests__/calendarDots.test.ts` | `pnpm --filter client test` |
| TEST-014 | `client/src/features/tasks/__tests__/agenda.test.ts` | `pnpm --filter client test` |
| TEST-015 | `client/src/features/tasks/__tests__/week.test.ts` | `pnpm --filter client test` |
| TEST-016 | `client/src/features/tasks/__tests__/columnSwipe.test.ts` | `pnpm --filter client test` |
| TEST-017 | `client/src/features/tasks/__tests__/filters.test.ts` | `pnpm --filter client test` |
| TEST-018 | `client/src/features/tasks/__tests__/date.test.ts` | `pnpm --filter client test` |
| TEST-019 | `client/src/features/tasks/__tests__/components.test.tsx` | `pnpm --filter client test` |
| TEST-020 | `client/src/features/workflow/__tests__/workflowBoard.test.tsx` | `pnpm --filter client test` |
| TEST-021 | `client/src/features/tasks/__tests__/bulkEdit.test.tsx` | `pnpm --filter client test` |
| TEST-022 | `client/src/features/tasks/__tests__/scope.test.ts` | `pnpm --filter client test` |
| TEST-023 | `server/src/__tests__/boardSettings.test.ts` | `pnpm --filter server test` |
| TEST-024 | `client/src/features/tasks/__tests__/permissions.test.tsx` | `pnpm --filter client test` |
