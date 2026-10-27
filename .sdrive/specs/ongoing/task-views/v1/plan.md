> **Retroactive specification** — documents behaviour that already exists in the codebase (onboarded 2026-10-16). Not authored upfront.

# task-views — technical plan

| | |
|---|---|
| Feature | `task-views` |
| Version | 1 |
| Governance | `.sdrive/governance/task-views/v1/plan.json` |

> **How to read `action`** — retroactive plan: `create` = this feature owns (and introduced) the file, `modify` = the feature changed an
> existing file, `reuse` = the feature depends on it without owning it. `assumption: true` — there is no feature-level commit history to
> prove which change introduced which line.

## 1. Approach

**One data path, four presentations.** `client/src/pages/TaskPage.tsx` owns the state:

- data from `useTasks` (the single source of truth — CON-111),
- the view (`?view=`), the filters (`useUrlFilters` from `features/views`, mirroring `lib/filters.ts`) and the board's own state
  (`?col`, `?qf`, `?group` through `useBoardUrlState`),
- capabilities from `usePermissions` (`tasks:write`, `tasks:delete`, `settings:manage`) passed down as `canWrite` / `canDelete`.

Each view implements `TaskViewProps` (`views/types.ts`) and is therefore interchangeable: list, board, calendar and timeline never fetch,
never touch the URL and never decide permissions. Board and calendar use native HTML5 drag and drop; the Gantt uses pointer events
(`setPointerCapture`); **every one of those gestures has a keyboard or button equivalent**, which is how CON-305 is satisfied:

| Interaction | Pointer / touch path | Keyboard or button path |
|---|---|---|
| Board: change a task's stage | drag a card to a column | per-card quick action, "Move to" sheet from the menu, the sheet also openable with a 500 ms long press |
| Board: switch column on a phone | swipe (60 px) | segmented tabs with Arrow/Home/End |
| List: change fields | click the cell | focusable inline editors (`InlineText`, `InlineDate`, selects) |
| List: act on many rows | row checkbox, Shift+click | header checkbox, Esc to clear, the bulk bar's buttons |
| Gantt: reschedule | drag the bar / its right edge | Arrow keys move, Shift+Arrow resizes |
| Calendar: reschedule | drag a task onto a day | the task's due date in the list/detail, or "add a task" on the target day |

## 2. Components

| Path | Action | Notes |
|---|---|---|
| `client/src/features/tasks/views/types.ts` | create | `TaskViewProps` — the shared contract (tasks, onUpdate, onEdit, onDelete, onCreate, onOpen, canWrite, canDelete). |
| `client/src/features/tasks/views/ListView.tsx` | create | Desktop grid table and phone cards, inline editing, subtask arrangement, custom columns, selection and the bulk bar. |
| `client/src/features/tasks/views/BoardView.tsx` | create | Kanban over the workflow stages: DnD with fractional positions, phone switcher/swipe/slide, quick move, long press, quick filters, swimlanes, WIP badge, pagination, completion burst. |
| `client/src/features/tasks/views/CalendarView.tsx` | create | Six-week month grid, drag-to-reschedule, dots and legend, phone week strip / month mode, Upcoming, Today. |
| `client/src/features/tasks/views/TimelineView.tsx` | create | Gantt bars, dependency arrows with conflicts, day/week zoom, pointer and keyboard rescheduling, live hold. |
| `client/src/features/tasks/hooks/useBoardSettings.ts` | create | WIP limits (tolerant read, save returning an error message), `useBoardUrlState`, `useIsDesktop`. |
| `client/src/features/tasks/lib/schedule.ts` | create | `getStartKey`, `rescheduleToDeadline`, `shiftTask`, `resizeTask`, `buildMonthGrid`, `groupByDeadline`, `buildTimeline`, `groupDaysByMonth`, `getLinkPath`. |
| `client/src/features/tasks/lib/boardQuickFilters.ts` | create | The five quick filters, canonical parse/serialize/toggle, `isBlocked`, `isDueThisWeek`. |
| `client/src/features/tasks/lib/swimlanes.ts` | create | `SWIMLANE_GROUPS`, lane keys with Unassigned/No project/No epic last, `groupIntoSwimlanes`, `laneIdOf`. |
| `client/src/features/tasks/lib/wip.ts` | create | `WipLimits`, `normalizeWipLimits`, `isOverWip`, `wipCountLabel`, `parseWipInput`. |
| `client/src/features/tasks/lib/pagination.ts` | create | `BOARD_PAGE_SIZE` (10), `paginate`, `pageCount`. |
| `client/src/features/tasks/lib/selection.ts` | create | `toggleId`, `selectionState`, `toggleAll`, `idsBetween`, `selectRange`, `pruneSelection`, `selectionLabel`. |
| `client/src/features/tasks/lib/listColumns.ts` | create | Built-in and custom columns, `visibleColumns`, `toggleColumn`, `gridTemplate`, `tableMinWidth`, `nextColumnSort`, `sortByColumn`. |
| `client/src/features/tasks/lib/columnSwipe.ts` | create | `SWIPE_THRESHOLD` (60), `swipeStep`, `stepColumn`. |
| `client/src/features/tasks/lib/calendarDots.ts` | create | `dotStateOf`, `summarizeDay`, `DOT_META` legend. |
| `client/src/features/tasks/lib/agenda.ts` | create | `buildAgenda`, `buildUpcoming`. |
| `client/src/features/tasks/lib/week.ts` | create | `startOfWeek`, `buildWeek`, `shiftWeek`, `defaultSelectedKey`, remembered mobile mode, `formatTaskRange`. |
| `client/src/features/tasks/lib/filters.ts` | reuse | Filter parameters and fallbacks; also `groupByStatus`, `positionBetween`, `getDropPosition`, `getTaskStats`. |
| `client/src/features/tasks/lib/date.ts` | reuse | Calendar-day helpers (CON-203). |
| `client/src/features/tasks/lib/subtasks.ts`, `epics.ts`, `scope.ts`, `scroll.ts`, `completion.ts`, `dragImage.ts` | reuse | Subtask arrangement, epic exclusion, scope resolution, reduced-motion scrolling, the completion burst and the drag preview. |
| `client/src/features/tasks/components/*.tsx` | create | `BoardQuickFilters`, `BoardSwimlanes`, `MoveTaskSheet`, `WipLimitsDialog`, `ListColumnsMenu`, `BulkActionBar`, `ViewSwitcher`, `TaskToolbar`, `FilterPills`, `ScopeBar`, `TaskBadges`, `TaskSelects`, `InlineEdit`, `TaskHoverCards`, `TaskActionsMenu`. |
| `client/src/features/tasks/index.ts` | modify | Publishes the four views and `TaskViewProps` (CON-110). |
| `client/src/pages/TaskPage.tsx` | modify | Selects and renders the view, applies the filters, owns loading/error/empty states and passes the capabilities. |
| `client/src/features/views/hooks/useUrlFilters.ts` | reuse | Filter object ↔ query string (owned by the views feature). |
| `client/src/features/workflow/hooks/useWorkflow.ts` | reuse | Stages for the board columns and the cached workflow used by optimistic updates. |
| `server/src/controllers/boardSettingsController.ts` | reuse | `GET` / `PUT board-settings`: the soft WIP limits the board reads and the dialog writes. |
| `server/src/utils/taskQuery.ts` | reuse | The server counterpart of the filter parameters. |

## 3. Data model

The views add no collection and no field: they render and write what `tasks-core` stores.

| Entity | Action | Fields the views read or write |
|---|---|---|
| `Task` | no_change | `status`, `stage`, `position`, `startDate`, `deadline`, `dependencies`, `assignees`, `custom` |
| `Workspace` | no_change | `workflow.stages` (board columns, WIP limits), `boardSettings.wipLimits` (legacy per-status limits) |

### Flow

`TaskPage` → `useTasks` (cached list) → in-memory filters (`lib/filters.ts`) → the selected view. A view calls back into the page
(`onUpdate`, `onCreate`, `onDelete`, `onOpen`), the page calls `useTasks`, and `useTasks` patches optimistically against `tasksApi` and rolls
back on failure. Drops send small patches: board → `position` + `stage`/`status`; calendar → `deadline` (+ `startDate` when the task spans
days); Gantt → `shiftTask`/`resizeTask`. Board controls, filters and the view are parsed from the query string by the pure helpers above and
written back on change.

## 4. API contracts

The views reuse the task API of `tasks-core` and the board-settings endpoint; nothing new is exposed.

| Method | Path | Notes | Requirement |
|---|---|---|---|
| GET | `/api/workspaces/:slug/tasks` | the list every view renders (once, cached) | FR-001, FR-011, NFR-001 |
| POST | `/api/workspaces/:slug/tasks` | create from the toolbar or from a calendar day | FR-008 |
| PATCH | `/api/workspaces/:slug/tasks/:id` | drop, reschedule, resize, inline edit | FR-002, FR-006, FR-008, FR-010 |
| PATCH | `/api/workspaces/:slug/tasks/bulk` | bulk bar patch | FR-007 |
| POST | `/api/workspaces/:slug/tasks/bulk-delete` | bulk bar delete (after confirmation) | FR-007 |
| GET | `/api/workspaces/:slug/workflow` | the board's columns and stage keys | FR-002, FR-003 |
| GET | `/api/workspaces/:slug/board-settings` | soft WIP limits; a 404 means "no limits" | FR-005 |
| PUT | `/api/workspaces/:slug/board-settings` | save the limits (`settings:manage`) | FR-005 |

All of them require authentication.

## 5. Security, performance, dependencies and risks

- **Security** — `canWrite` / `canDelete` are presentation only; the API keeps enforcing `tasks:write` and `tasks:delete`
  (`server/src/config/permissions.ts` via `requirePermission`), so a hidden control is never the boundary (EC-009).
- **Performance** — per-column pagination, memoised grouping, one fractional position per drop, and one cached task list shared by all four
  views; phones render one column and a week-zoom Gantt.
- **Dependencies** — `react-router-dom`, `motion`, `lucide-react`, Tailwind v4 and the internal `useTasks`, `features/workflow`,
  `features/fields`, `features/views` modules. No drag-and-drop library was added.
- **Risks** — see `spec.md` §6: three interaction models, list size, and URL/component state drift.

## 6. Retroactive validation

Confirmed by the tests listed in `spec.md` §7 and by `node .sdrive/scripts/validate-governance.js`. The repository quality gates (CON-402)
are `pnpm --filter client typecheck && pnpm --filter client test && pnpm --filter client lint` and `pnpm --filter client build`.
