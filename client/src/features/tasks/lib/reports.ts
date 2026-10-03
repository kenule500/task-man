import type { Task, TaskPriority, TaskStatus } from '../types';
import { TASK_PRIORITIES, TASK_STATUSES } from '../constants';
import { addDays, dateKeyOf, formatDate, startOfDay, toDateKey } from './date';

/** Name used for tasks that have no project; the UI shows it as "No project". */
export const NO_PROJECT = '';

export interface ProjectSummary {
  name: string;
  total: number;
  completed: number;
  inProgress: number;
  overdue: number;
  /** Share of completed tasks, 0-100 (integer). */
  progress: number;
  /** Earliest `YYYY-MM-DD` deadline among unfinished tasks. */
  nextDeadline?: string;
}

export interface WeekCount {
  label: string;
  count: number;
}

export interface TaskReport {
  total: number;
  /** Share of completed tasks, 0-100 (integer). */
  completionRate: number;
  byStatus: Record<TaskStatus, number>;
  byPriority: Record<TaskPriority, number>;
  overdue: Task[];
  dueThisWeek: Task[];
  /** Last 6 weeks (Monday start), oldest first, counted by `completedAt`. */
  completedPerWeek: WeekCount[];
}

export const REPORT_WEEKS = 6;

const percent = (part: number, whole: number) => (whole === 0 ? 0 : Math.round((part / whole) * 100));

const byDeadline = (a: Task, b: Task) => dateKeyOf(a.deadline).localeCompare(dateKeyOf(b.deadline));

/** Groups tasks by their project label (trimmed), sorted by name. Tasks without one use `''`. */
export const summarizeProjects = (tasks: Task[], today: Date = new Date()): ProjectSummary[] => {
  const todayKey = toDateKey(today);
  const groups = new Map<string, ProjectSummary>();

  for (const task of tasks) {
    const name = task.project?.trim() ?? NO_PROJECT;
    const summary = groups.get(name)
      ?? { name, total: 0, completed: 0, inProgress: 0, overdue: 0, progress: 0 };
    const deadline = dateKeyOf(task.deadline);

    summary.total += 1;
    if (task.status === 'completed') {
      summary.completed += 1;
    } else {
      if (task.status === 'in-progress') summary.inProgress += 1;
      if (deadline < todayKey) summary.overdue += 1;
      if (!summary.nextDeadline || deadline < summary.nextDeadline) summary.nextDeadline = deadline;
    }
    groups.set(name, summary);
  }

  return [...groups.values()]
    .map(summary => ({ ...summary, progress: percent(summary.completed, summary.total) }))
    .sort((a, b) => a.name.localeCompare(b.name));
};

const startOfWeek = (date: Date): Date => {
  const day = startOfDay(date);
  return addDays(day, -((day.getDay() + 6) % 7));
};

/** Analytics for the Reports page. Pure: pass `today` in tests. */
export const buildReport = (tasks: Task[], today: Date = new Date()): TaskReport => {
  const todayKey = toDateKey(today);
  const weekEndKey = toDateKey(addDays(today, 7));

  const byStatus = Object.fromEntries(TASK_STATUSES.map(status => [status, 0])) as Record<TaskStatus, number>;
  const byPriority = Object.fromEntries(TASK_PRIORITIES.map(priority => [priority, 0])) as Record<TaskPriority, number>;

  const firstWeek = addDays(startOfWeek(today), -7 * (REPORT_WEEKS - 1));
  const weekStarts = Array.from({ length: REPORT_WEEKS }, (_, i) => addDays(firstWeek, 7 * i));
  const weekKeys = weekStarts.map(toDateKey);
  const windowEndKey = toDateKey(addDays(startOfWeek(today), 7));
  const weekCounts = new Array<number>(REPORT_WEEKS).fill(0);

  const overdue: Task[] = [];
  const dueThisWeek: Task[] = [];

  for (const task of tasks) {
    byStatus[task.status] += 1;
    byPriority[task.priority] += 1;

    if (task.status === 'completed') {
      if (task.completedAt) {
        const doneKey = toDateKey(new Date(task.completedAt));
        if (doneKey >= weekKeys[0] && doneKey < windowEndKey) {
          // Last week that starts on or before the completion day
          let index = 0;
          weekKeys.forEach((key, i) => { if (key <= doneKey) index = i; });
          weekCounts[index] += 1;
        }
      }
      continue;
    }

    const deadline = dateKeyOf(task.deadline);
    if (deadline < todayKey) overdue.push(task);
    else if (deadline <= weekEndKey) dueThisWeek.push(task);
  }

  return {
    total: tasks.length,
    completionRate: percent(byStatus.completed, tasks.length),
    byStatus,
    byPriority,
    overdue: overdue.sort(byDeadline),
    dueThisWeek: dueThisWeek.sort(byDeadline),
    completedPerWeek: weekStarts.map((start, i) => ({
      label: formatDate(toDateKey(start), { month: 'short', day: 'numeric' }),
      count: weekCounts[i],
    })),
  };
};
