import type { Task } from '@/features/tasks';
import { addDays, dateKeyOf, diffInDays, formatDate, parseDateKey, toDateKey } from '@/features/tasks';
import type { Sprint } from '../types';

export const pointsOf = (task: Pick<Task, 'storyPoints'>): number => Math.max(0, task.storyPoints ?? 0);

export interface WorkProgress {
  totalTasks: number;
  doneTasks: number;
  totalPoints: number;
  donePoints: number;
  /** 0-100, by story points when any task is estimated, otherwise by task count. */
  percent: number;
  unit: 'points' | 'tasks';
}

const percentOf = (part: number, whole: number) => (whole === 0 ? 0 : Math.round((part / whole) * 100));

/** Progress of a list of tasks; subtasks are ignored (their points are part of the parent's estimate). */
export const workProgress = (tasks: Task[]): WorkProgress => {
  const top = tasks.filter(task => !task.parent);
  const done = top.filter(task => task.status === 'completed');
  const totalPoints = top.reduce((sum, task) => sum + pointsOf(task), 0);
  const donePoints = done.reduce((sum, task) => sum + pointsOf(task), 0);
  const byPoints = totalPoints > 0;
  return {
    totalTasks: top.length,
    doneTasks: done.length,
    totalPoints,
    donePoints,
    percent: byPoints ? percentOf(donePoints, totalPoints) : percentOf(done.length, top.length),
    unit: byPoints ? 'points' : 'tasks',
  };
};

/** "8 of 21 points" or "3 of 5 tasks". */
export const describeProgress = (progress: WorkProgress): string =>
  progress.unit === 'points'
    ? `${progress.donePoints} of ${progress.totalPoints} points`
    : `${progress.doneTasks} of ${progress.totalTasks} ${progress.totalTasks === 1 ? 'task' : 'tasks'}`;

/** Calendar days from today to the sprint's end date (negative once it is over). */
export const daysUntilEnd = (sprint: Pick<Sprint, 'endDate'>, today: Date = new Date()): number =>
  diffInDays(today, parseDateKey(sprint.endDate));

/** "5 days left", "Ends today", "Ended 2 days ago". */
export const describeDaysLeft = (sprint: Pick<Sprint, 'endDate'>, today: Date = new Date()): string => {
  const days = daysUntilEnd(sprint, today);
  if (days === 0) return 'Ends today';
  if (days === 1) return '1 day left';
  if (days > 1) return `${days} days left`;
  return days === -1 ? 'Ended 1 day ago' : `Ended ${-days} days ago`;
};

export const isSprintLate = (sprint: Pick<Sprint, 'endDate' | 'status'>, today: Date = new Date()): boolean =>
  sprint.status === 'active' && daysUntilEnd(sprint, today) < 0;

const SHORT = { month: 'short', day: 'numeric' } as const;

/** "Oct 1 – Oct 14, 2026" (the year once, on the end date). */
export const formatSprintRange = (sprint: Pick<Sprint, 'startDate' | 'endDate'>): string =>
  `${formatDate(dateKeyOf(sprint.startDate), SHORT)} – ${formatDate(dateKeyOf(sprint.endDate))}`;

/** Default dates of a new sprint: the day after the latest sprint ends (never in the past), lasting two weeks. */
export const suggestSprintDates = (sprints: Sprint[], today: Date = new Date()): { startDate: string; endDate: string } => {
  const lastEnd = sprints.map(sprint => dateKeyOf(sprint.endDate)).sort().at(-1);
  const afterLast = lastEnd ? addDays(parseDateKey(lastEnd), 1) : today;
  const start = toDateKey(afterLast) < toDateKey(today) ? today : afterLast;
  return { startDate: toDateKey(start), endDate: toDateKey(addDays(start, 13)) };
};

/** Next "Sprint N" name based on the existing sprint count. */
export const suggestSprintName = (sprints: Sprint[]): string => `Sprint ${sprints.length + 1}`;
