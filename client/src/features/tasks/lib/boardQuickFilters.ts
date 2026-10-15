// Jira-style quick filters above the board: toggle chips, AND-combined, kept in the URL (?qf=mine,bugs).
import type { Task } from '../types';
import { addDays, dateKeyOf, toDateKey } from './date';
import { startOfWeek } from './week';

export const QUICK_FILTER_KEYS = ['mine', 'bugs', 'due-week', 'blocked', 'unassigned'] as const;
export type QuickFilterKey = (typeof QUICK_FILTER_KEYS)[number];

export const QUICK_FILTER_LABELS: Record<QuickFilterKey, string> = {
  mine: 'My tasks',
  bugs: 'Bugs',
  'due-week': 'Due this week',
  blocked: 'Blocked',
  unassigned: 'Unassigned',
};

export interface QuickFilterContext {
  /** Needed by "My tasks"; without it that filter matches nothing. */
  currentUserId?: string;
  /** Every task of the workspace, to resolve dependencies hidden by other filters. Defaults to the tasks given. */
  allTasks?: readonly Task[];
  /** "Today" (tests); defaults to now. */
  today?: Date;
}

const isQuickFilterKey = (value: string): value is QuickFilterKey =>
  (QUICK_FILTER_KEYS as readonly string[]).includes(value);

/** `?qf=` value -> valid keys in canonical order; unknown keys and duplicates are dropped. */
export const parseQuickFilters = (value: string | null | undefined): QuickFilterKey[] => {
  const wanted = new Set((value ?? '').split(',').map(part => part.trim()).filter(isQuickFilterKey));
  return QUICK_FILTER_KEYS.filter(key => wanted.has(key));
};

/** Keys -> `?qf=` value ('' when none, so the caller can drop the param). */
export const serializeQuickFilters = (keys: readonly QuickFilterKey[]): string =>
  QUICK_FILTER_KEYS.filter(key => keys.includes(key)).join(',');

export const toggleQuickFilter = (keys: readonly QuickFilterKey[], key: QuickFilterKey): QuickFilterKey[] =>
  keys.includes(key) ? keys.filter(item => item !== key) : QUICK_FILTER_KEYS.filter(item => item === key || keys.includes(item));

/** True when a task waits for at least one unfinished prerequisite. Finished tasks are never blocked. */
export const isBlocked = (task: Task, byId: ReadonlyMap<string, Task>): boolean =>
  task.status !== 'completed'
  && (task.dependencies ?? []).some(id => {
    const prerequisite = byId.get(id);
    return prerequisite !== undefined && prerequisite.status !== 'completed';
  });

/** Due between the Sunday and Saturday of the current week (same week as the calendar). */
export const isDueThisWeek = (task: Task, today: Date = new Date()): boolean => {
  const start = startOfWeek(today);
  const day = dateKeyOf(task.deadline);
  return day >= toDateKey(start) && day <= toDateKey(addDays(start, 6));
};

const matchers: Record<QuickFilterKey, (task: Task, context: QuickFilterContext, byId: ReadonlyMap<string, Task>) => boolean> = {
  mine: (task, { currentUserId }) =>
    Boolean(currentUserId && task.assignees?.some(user => user._id === currentUserId)),
  bugs: task => task.type === 'bug',
  'due-week': (task, { today }) => isDueThisWeek(task, today),
  blocked: (task, _context, byId) => isBlocked(task, byId),
  unassigned: task => !task.assignees || task.assignees.length === 0,
};

/** Tasks that satisfy every active quick filter (AND). No keys returns the same array. */
export const applyQuickFilters = (
  tasks: Task[],
  keys: readonly QuickFilterKey[],
  context: QuickFilterContext = {},
): Task[] => {
  if (keys.length === 0) return tasks;
  const byId = new Map((context.allTasks ?? tasks).map(task => [task._id, task]));
  return tasks.filter(task => keys.every(key => matchers[key](task, context, byId)));
};
