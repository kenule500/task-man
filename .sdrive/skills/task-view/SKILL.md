---
name: task-view
description: How to add or change a task view (list, board, calendar, timeline) in TaskMan - the TaskViewProps contract, data flow through useTasks, wiring into the view switcher and the tests to write.
version: 1.0.0
tags: [client, tasks, views, board, calendar, gantt]
source: custom (derived from AGENTS.md and client/src/features/tasks/views/types.ts)
license: project-internal
last_updated: 2026-10-16
---

# Adding a task view

## The contract

Every view in `client/src/features/tasks/views/` implements the same props type, so views are interchangeable:

```ts
export interface TaskViewProps {
  tasks: Task[];                                              // already filtered by the page
  onUpdate: (id: string, patch: TaskPatch) => Promise<Task | null>;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
  onCreate: (defaults?: Partial<TaskFormValues>) => void;      // optional prefill (day, column…)
  onOpen?: (task: Task) => void;                               // detail dialog; views fall back to onEdit
  canWrite?: boolean;                                          // tasks:write - false = read-only, no drag
  canDelete?: boolean;                                         // tasks:delete - hides delete actions
}
```

- Take data from the props; the page owns filtering. Use the `useTasks` hook for mutations and derived state, and never call the API directly from a view (CON-111).
- Use `canWrite` / `canDelete` to disable inline editing, drag-and-drop and destructive actions, rather than checking permissions yourself.
- Prefer `onOpen` when a detail dialog exists; fall back to `onEdit` when it is omitted.

## Checklist for a new view

1. Create `client/src/features/tasks/views/<Name>View.tsx` typed as `TaskViewProps` and export it from the views barrel.
2. Keep the maths pure in `client/src/features/tasks/lib/` (scheduling, lane grouping, date maths) and unit test it there (CON-202).
3. Register the view in the view switcher and the URL state so `?view=<name>` works, mirroring the existing views.
4. Reuse the shared pieces: `TaskActionsMenu`, `TaskFormDialog`, `TaskChips`, `InlineEdit`, `TaskKey`, and the `components/ds` primitives.
5. Handle empty, loading and error states, keyboard operation and narrow screens (CON-703).
6. Drag-and-drop: native HTML5 DnD for board/calendar, pointer events for the Gantt, with a keyboard equivalent (arrows move, Shift+arrows resize) (CON-305).

## Tests

- Colocated in `client/src/features/tasks/__tests__/`, e.g. `views.test.tsx`, `board.test.tsx`, `calendar.test.tsx` — follow their patterns.
- Cover: rendering with an empty list, permission-reduced behaviour (`canWrite`/`canDelete` false), the mutation callbacks being invoked with the right arguments, and drag/keyboard interactions.
- Run `pnpm --filter client test`, `pnpm --filter client typecheck`, `pnpm --filter client lint`.

## Pitfalls

- Doing date maths with raw `Date` on `YYYY-MM-DD` strings: use `lib/date.ts` (CON-203) and `lib/schedule.ts`.
- Duplicating filtering that the page already performed on `tasks`.
- Optimistic UI that bypasses `useTasks`, which desynchronises the other views.
- Letting a view become the source of truth for permissions instead of honouring `canWrite`/`canDelete`.
