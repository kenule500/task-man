> **Retroactive specification** — documents behaviour that already exists in the codebase (onboarded 2026-10-16). Not authored upfront.

# task-views — execution tasks

| | |
|---|---|
| Feature | `task-views` |
| Version | 1 |
| Governance | `.sdrive/governance/task-views/v1/tasks.json` |

Every task below is already implemented and verified, so each line is checked. Test ids refer to `spec.md` §7.

## P1 — Shared contract and pure view rules

- [x] **T1.1 Define the shared TaskViewProps contract** — `views/types.ts`, `index.ts` (FR-001, NFR-001; AC-008, AC-018; TEST-001)
- [x] **T1.2 Write the shared scheduling maths** — `lib/schedule.ts` (FR-008, FR-010, NFR-003; AC-012, AC-015; TEST-012)
- [x] **T1.3 Write the board rules as pure helpers** — `lib/boardQuickFilters.ts`, `lib/swimlanes.ts`, `lib/wip.ts`, `lib/pagination.ts`, `lib/columnSwipe.ts` (FR-003, FR-004, FR-005; AC-005, AC-020, AC-022, AC-023, AC-024; TEST-006, TEST-007, TEST-008, TEST-009, TEST-016)
- [x] **T1.4 Write the list column and selection rules** — `lib/listColumns.ts`, `lib/selection.ts` (FR-006, FR-007; AC-010, AC-011; TEST-010, TEST-011)
- [x] **T1.5 Write the calendar day summaries and phone modes** — `lib/calendarDots.ts`, `lib/agenda.ts`, `lib/week.ts` (FR-009; AC-013, AC-014; TEST-013, TEST-014, TEST-015)
- [x] **T1.6 Keep view, filter and board state in the URL** — `lib/filters.ts`, `hooks/useBoardSettings.ts` (FR-011, FR-005; AC-018, AC-019, AC-020; TEST-017, TEST-005)

## P2 — Views

- [x] **T2.1 Render the board columns and drag and drop** — `views/BoardView.tsx`, `lib/filters.getDropPosition` (FR-002; AC-001, AC-002, AC-003; TEST-020)
- [x] **T2.2 Add the phone board interactions** — column switcher with `?col=`, `lib/columnSwipe`, Arrow/Home/End, quick move, `MoveTaskSheet.tsx`, long press, reduced-motion slide (FR-003, NFR-002, NFR-004; AC-004, AC-005, AC-006, AC-007; TEST-002, TEST-004)
- [x] **T2.3 Add board quick filters, swimlanes, WIP and pagination** — `BoardQuickFilters.tsx`, `BoardSwimlanes.tsx`, `WipLimitsDialog.tsx`, `useBoardSettings` (FR-004, FR-005; AC-020, AC-022, AC-023, AC-024; TEST-004, TEST-020, TEST-023)
- [x] **T2.4 Render the list table and cards with inline editing** — `views/ListView.tsx`, `ListColumnsMenu.tsx`, `InlineEdit.tsx`, `TaskSelects.tsx` (FR-006; AC-008, AC-009, AC-010; TEST-001, TEST-011)
- [x] **T2.5 Add list selection and the bulk action bar** — `lib/selection.ts`, `BulkActionBar.tsx` (FR-007; AC-011; TEST-010, TEST-021)
- [x] **T2.6 Render the calendar month grid with drag to reschedule** — `views/CalendarView.tsx`, `lib/schedule` (FR-008; AC-012; TEST-003)
- [x] **T2.7 Add the calendar dots, agenda and phone modes** — dots and legend, week strip / month mode, Upcoming, Today with the `t` shortcut (FR-009, NFR-004; AC-013, AC-014; TEST-003, TEST-013, TEST-014, TEST-015)
- [x] **T2.8 Render the Gantt timeline with arrows and rescheduling** — `views/TimelineView.tsx`, `lib/schedule.buildTimeline`/`getLinkPath`, `useLiveHold` (FR-010, NFR-002, NFR-003; AC-015, AC-016, AC-017; TEST-001, TEST-012)
- [x] **T2.9 Wire the view, filters and permissions into the task page** — `pages/TaskPage.tsx` (FR-001, FR-011, FR-012, NFR-001; AC-018, AC-019, AC-021; TEST-001, TEST-024)

## P3 — Verification

- [x] **T3.1 Cover the views' rendering and callbacks** — `views.test.tsx`, `components.test.tsx`, `permissions.test.tsx`, `workflowBoard.test.tsx` (TEST-001, TEST-019, TEST-020, TEST-024)
- [x] **T3.2 Cover the interaction paths** — `board.test.tsx`, `boardFeatures.test.tsx`, `boardUrlState.test.tsx`, `calendar.test.tsx`, `bulkEdit.test.tsx` (TEST-002, TEST-003, TEST-004, TEST-005, TEST-021)
- [x] **T3.3 Unit test the pure helpers** — `boardQuickFilters`, `swimlanes`, `wip`, `pagination`, `selection`, `listColumns`, `schedule`, `calendarDots`, `agenda`, `week`, `columnSwipe`, `filters`, `date` (CON-202) (TEST-006 … TEST-018)
- [x] **T3.4 Pass typecheck, lint, tests and build** — `pnpm --filter client typecheck && pnpm --filter client test && pnpm --filter client lint`; `pnpm --filter client build`; `pnpm --filter server test` for the board-settings endpoint (CON-402)
