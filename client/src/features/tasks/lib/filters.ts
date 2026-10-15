import { PRIORITY_META, SORT_OPTIONS, TASK_PRIORITIES, TASK_STATUSES, TASK_TYPES } from '../constants';
import { isOverdue } from './date';
import type { Task, TaskFilters, TaskSort, TaskStatus } from '../types';
import { matchesKey } from './taskKey';

const SORT_VALUES: TaskSort[] = SORT_OPTIONS.map(option => option.value);

export const DEFAULT_FILTERS: TaskFilters = {
  search: '', status: 'all', priority: 'all', sort: 'createdAt', assignedToMe: false, label: 'all', type: 'all', epic: 'all', project: 'all', sprint: 'all', release: 'all', custom: {},
};

// ---------------------------------------------------------------------------
// Filters <-> URL query string, so any view can be shared by link
// ---------------------------------------------------------------------------

/**
 * Query parameters owned by the filters; `view`, `task`, `new` and the board's `col`, `qf`, `group` are left alone.
 * `project` is a project name; `sprint` is a sprint id, `active` (the project's running sprint) or `backlog` (no sprint);
 * `release` is a release id or `none`; `cf.<field key>` filters by a custom field (see `isFilterParam`).
 */
export const FILTER_PARAMS = ['q', 'status', 'priority', 'type', 'label', 'epic', 'project', 'sprint', 'release', 'assignedToMe', 'sort'] as const;

/** Custom field filters are `cf.<key>` with a field slug as key (same pattern as the server). */
const CUSTOM_PARAM = /^cf.([a-z][a-z0-9_]{0,29})$/;
/** Most custom field filters at once (the server keeps this many). */
export const MAX_CUSTOM_FILTERS = 5;

/** True for a query parameter the filters own (the fixed ones and `cf.<key>`). */
export const isFilterParam = (name: string): boolean => (FILTER_PARAMS as readonly string[]).includes(name) || CUSTOM_PARAM.test(name);

const MAX_SEARCH_PARAM = 200;
const MAX_VALUE_PARAM = 80;

const oneOf = <T extends string, F extends string>(value: string | null, allowed: readonly T[], fallback: F): T | F =>
  allowed.includes(value as T) ? (value as T) : fallback;

const freeText = (value: string | null): string => {
  const text = value?.trim() ?? '';
  return text && text.length <= MAX_VALUE_PARAM ? text : 'all';
};

/** A sprint id (letters, digits, `-`, `_`) or one of the keywords; anything else is ignored. */
const sprintParam = (value: string | null): string => {
  const text = value?.trim() ?? '';
  return /^[\w-]{1,64}$/.test(text) ? text : 'all';
};

/** The `cf.<key>=<value>` pairs of a query string: plain values only, at most 5, sorted by key. */
const customParams = (params: URLSearchParams): Record<string, string> => {
  const found: Record<string, string> = {};
  for (const [name, raw] of params) {
    const key = CUSTOM_PARAM.exec(name)?.[1];
    const value = raw.trim();
    if (key && value && value.length <= MAX_VALUE_PARAM && !(key in found)) found[key] = value;
  }
  return Object.fromEntries(Object.entries(found).sort(([a], [b]) => a.localeCompare(b)).slice(0, MAX_CUSTOM_FILTERS));
};

/** Reads the filters from a query string. Missing, unknown or oversized values fall back to the defaults. */
export const parseFilterParams = (params: URLSearchParams): TaskFilters => {
  const epic = freeText(params.get('epic'));
  return {
    search: (params.get('q') ?? '').slice(0, MAX_SEARCH_PARAM),
    status: oneOf(params.get('status'), TASK_STATUSES, 'all'),
    priority: oneOf(params.get('priority'), TASK_PRIORITIES, 'all'),
    type: oneOf(params.get('type'), TASK_TYPES, 'all'),
    label: freeText(params.get('label')),
    epic: /\s/.test(epic) ? 'all' : epic,
    project: freeText(params.get('project')),
    sprint: sprintParam(params.get('sprint')),
    release: sprintParam(params.get('release')),
    custom: customParams(params),
    assignedToMe: params.get('assignedToMe') === '1' || params.get('assignedToMe') === 'true',
    sort: oneOf(params.get('sort'), SORT_VALUES, DEFAULT_FILTERS.sort),
  };
};

/** The query parameters for `filters`; values equal to the defaults are left out. */
export const serializeFilters = (filters: TaskFilters): URLSearchParams => {
  const params = new URLSearchParams();
  if (filters.search.trim()) params.set('q', filters.search);
  if (filters.status !== 'all') params.set('status', filters.status);
  if (filters.priority !== 'all') params.set('priority', filters.priority);
  if ((filters.type ?? 'all') !== 'all') params.set('type', filters.type as string);
  if ((filters.label ?? 'all') !== 'all') params.set('label', filters.label as string);
  if ((filters.epic ?? 'all') !== 'all') params.set('epic', filters.epic as string);
  if ((filters.project ?? 'all') !== 'all') params.set('project', filters.project as string);
  if ((filters.sprint ?? 'all') !== 'all') params.set('sprint', filters.sprint as string);
  if ((filters.release ?? 'all') !== 'all') params.set('release', filters.release as string);
  for (const [key, value] of Object.entries(filters.custom ?? {}).sort(([a], [b]) => a.localeCompare(b)).slice(0, MAX_CUSTOM_FILTERS)) {
    if (value && CUSTOM_PARAM.test(`cf.${key}`)) params.set(`cf.${key}`, value);
  }
  if (filters.assignedToMe) params.set('assignedToMe', '1');
  if (filters.sort !== DEFAULT_FILTERS.sort) params.set('sort', filters.sort);
  return params;
};

/** `current` with its filter parameters replaced by those of `filters`; every other parameter is kept. */
export const withFilterParams = (current: URLSearchParams, filters: TaskFilters): URLSearchParams => {
  const next = new URLSearchParams(current);
  for (const name of [...next.keys()]) if (isFilterParam(name)) next.delete(name);
  for (const [name, value] of serializeFilters(filters)) next.set(name, value);
  return next;
};

/** Stable text for comparing the filters of two states (e.g. the URL and the page). */
export const filtersKey = (filters: TaskFilters): string => serializeFilters(filters).toString();

type MatchableFilters = Pick<TaskFilters, 'search' | 'status'> & Partial<Pick<TaskFilters, 'priority' | 'assignedToMe' | 'label' | 'type' | 'epic' | 'project' | 'sprint' | 'release' | 'custom'>>;

/**
 * Custom field filters: every pair must match. `none` = no value; otherwise the stored value equals the filter text
 * (numbers and checkboxes compare as text) or, for a multi-select, contains it.
 */
export const matchesCustom = (task: Pick<Task, 'custom'>, custom: Record<string, string>): boolean =>
  Object.entries(custom).every(([key, wanted]) => {
    const value = task.custom?.[key];
    const empty = value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);
    if (wanted === 'none') return empty;
    if (empty) return false;
    return Array.isArray(value) ? value.includes(wanted) : String(value) === wanted;
  });

/**
 * `sprint` is `all`, `backlog` (no sprint) or one or more sprint ids joined by commas. `active` must be turned into
 * ids first (`resolveScopeFilters` in `scope.ts`); left as it is, it matches nothing.
 *
 * `currentUserId` is needed for the "assigned to me" filter; without it that filter matches nothing.
 * `projectKeyOf` gives a task's project key so searching "WEB-12" works (without it keys read "TM-12").
 */
export const matchesFilters = (
  task: Task,
  { search, status, priority = 'all', assignedToMe = false, label = 'all', type = 'all', epic = 'all', project = 'all', sprint = 'all', release = 'all', custom }: MatchableFilters,
  currentUserId?: string,
  projectKeyOf?: (task: Task) => string | undefined,
) => {
  if (status !== 'all' && task.status !== status) return false;
  if (priority !== 'all' && task.priority !== priority) return false;
  if (type !== 'all' && (task.type ?? 'task') !== type) return false;
  if (epic !== 'all' && (epic === 'none' ? Boolean(task.epic) : task.epic !== epic)) return false;
  if (project !== 'all' && (task.project ?? '').trim().toLowerCase() !== project.trim().toLowerCase()) return false;
  if (sprint !== 'all' && (sprint === 'backlog' ? Boolean(task.sprint) : !task.sprint || !sprint.split(',').includes(task.sprint))) return false;
  if (release !== 'all' && (release === 'none' ? Boolean(task.release) : task.release !== release)) return false;
  if (custom && !matchesCustom(task, custom)) return false;
  if (assignedToMe && !(currentUserId && task.assignees?.some(user => user._id === currentUserId))) return false;
  if (label !== 'all' && !task.labels?.some(item => item.toLowerCase() === label.toLowerCase())) return false;
  const term = search.trim().toLowerCase();
  if (!term) return true;
  return task.title.toLowerCase().includes(term)
    || (task.description?.toLowerCase().includes(term) ?? false)
    || matchesKey(task, term, projectKeyOf?.(task));
};

/** Epics are containers: the board and the calendar show the work items inside them instead. */
export const withoutEpics = (tasks: Task[]): Task[] => tasks.filter(task => task.type !== 'epic');

/** The epics among `tasks`, oldest first. */
export const epicsOf = (tasks: Task[]): Task[] =>
  tasks.filter(task => task.type === 'epic').sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? '') || a.title.localeCompare(b.title));

const byDeadline = (a: Task, b: Task) => a.deadline.localeCompare(b.deadline);
const byPriority = (a: Task, b: Task) => PRIORITY_META[a.priority].rank - PRIORITY_META[b.priority].rank;
const byNewest = (a: Task, b: Task) => (b.createdAt ?? '').localeCompare(a.createdAt ?? '');

const COMPARATORS: Record<TaskSort, (a: Task, b: Task) => number> = {
  deadline: (a, b) => byDeadline(a, b) || byPriority(a, b),
  priority: (a, b) => byPriority(a, b) || byDeadline(a, b),
  createdAt: byNewest,
};

export const sortTasks = (tasks: Task[], sort: TaskSort): Task[] => [...tasks].sort(COMPARATORS[sort]);

/** Filter + search + sort in one pass, the way every view consumes tasks. */
export const applyFilters = (
  tasks: Task[],
  filters: TaskFilters,
  currentUserId?: string,
  projectKeyOf?: (task: Task) => string | undefined,
): Task[] =>
  sortTasks(tasks.filter(task => matchesFilters(task, filters, currentUserId, projectKeyOf)), filters.sort);

/** Board columns: tasks grouped by status, ordered by their manual position. */
export const groupByStatus = (tasks: Task[]): Record<TaskStatus, Task[]> => {
  const groups = Object.fromEntries(TASK_STATUSES.map(status => [status, [] as Task[]])) as Record<TaskStatus, Task[]>;
  for (const task of tasks) groups[task.status].push(task);
  for (const status of TASK_STATUSES) groups[status].sort((a, b) => a.position - b.position || byDeadline(a, b));
  return groups;
};

/**
 * Position for an item dropped between two neighbours (fractional indexing),
 * so a reorder only updates the moved task.
 */
export const positionBetween = (before?: number, after?: number): number => {
  if (before === undefined && after === undefined) return Date.now();
  if (before === undefined) return (after as number) - 1024;
  if (after === undefined) return before + 1024;
  return (before + after) / 2;
};

/**
 * New position for `taskId` dropped at `index` of a rendered column
 * (the dragged card itself is ignored). Returns null when nothing moves.
 */
export const getDropPosition = (column: Task[], taskId: string, index: number): number | null => {
  const from = column.findIndex(task => task._id === taskId);
  const others = column.filter(task => task._id !== taskId);
  const insertAt = from !== -1 && from < index ? index - 1 : index;
  if (from !== -1 && insertAt === from) return null;
  return positionBetween(others[insertAt - 1]?.position, others[insertAt]?.position);
};

export const getTaskStats = (tasks: Task[]) => {
  const stats = { total: tasks.length, pending: 0, inProgress: 0, completed: 0, overdue: 0 };
  for (const task of tasks) {
    if (task.status === 'pending') stats.pending += 1;
    else if (task.status === 'in-progress') stats.inProgress += 1;
    else stats.completed += 1;
    if (isOverdue(task.deadline, task.status === 'completed')) stats.overdue += 1;
  }
  return stats;
};
