import { PRIORITY_META, TASK_STATUSES } from '../constants';
import { isOverdue } from './date';
import type { Task, TaskFilters, TaskSort, TaskStatus } from '../types';

export const DEFAULT_FILTERS: TaskFilters = {
  search: '', status: 'all', priority: 'all', sort: 'createdAt', assignedToMe: false, label: 'all', type: 'all',
};

type MatchableFilters = Pick<TaskFilters, 'search' | 'status'> & Partial<Pick<TaskFilters, 'priority' | 'assignedToMe' | 'label' | 'type'>>;

/** `currentUserId` is needed for the "assigned to me" filter; without it that filter matches nothing. */
export const matchesFilters = (
  task: Task,
  { search, status, priority = 'all', assignedToMe = false, label = 'all', type = 'all' }: MatchableFilters,
  currentUserId?: string,
) => {
  if (status !== 'all' && task.status !== status) return false;
  if (priority !== 'all' && task.priority !== priority) return false;
  if (type !== 'all' && (task.type ?? 'task') !== type) return false;
  if (assignedToMe && !(currentUserId && task.assignees?.some(user => user._id === currentUserId))) return false;
  if (label !== 'all' && !task.labels?.some(item => item.toLowerCase() === label.toLowerCase())) return false;
  const term = search.trim().toLowerCase();
  if (!term) return true;
  return task.title.toLowerCase().includes(term) || (task.description?.toLowerCase().includes(term) ?? false);
};

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
export const applyFilters = (tasks: Task[], filters: TaskFilters, currentUserId?: string): Task[] =>
  sortTasks(tasks.filter(task => matchesFilters(task, filters, currentUserId)), filters.sort);

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
