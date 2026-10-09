import type { Task } from '@/features/tasks';
import { addDays, dateKeyOf, diffInDays, parseDateKey, toDateKey } from '@/features/tasks';
import type { Sprint } from '../types';
import { pointsOf } from './sprintStats';

export interface BurndownPoint {
  /** `YYYY-MM-DD` */
  date: string;
  /** Straight line from the full scope on day one to zero on the last day. */
  ideal: number;
  /** Work left at the end of that day; `null` for days that have not happened yet. */
  remaining: number | null;
}

export interface Burndown {
  unit: 'points' | 'tasks';
  /** Scope at the start of the sprint (what the chart burns down from). */
  total: number;
  points: BurndownPoint[];
}

/** A chart longer than this would be unreadable; sprints are weeks long. */
const MAX_DAYS = 120;

/**
 * Remaining work per day of a sprint, from its start to its end date.
 * Uses story points when any sprint task is estimated, otherwise counts tasks. Subtasks are ignored.
 * A task counts as done on the day of its `completedAt` (completed tasks without one count as done today).
 */
export const buildBurndown = (sprint: Pick<Sprint, '_id' | 'startDate' | 'endDate'>, tasks: Task[], today: Date = new Date()): Burndown => {
  const scope = tasks.filter(task => task.sprint === sprint._id && !task.parent);
  const estimated = scope.some(task => pointsOf(task) > 0);
  const weight = (task: Task) => (estimated ? pointsOf(task) : 1);
  const total = scope.reduce((sum, task) => sum + weight(task), 0);

  const startKey = dateKeyOf(sprint.startDate);
  const endKey = dateKeyOf(sprint.endDate);
  const todayKey = toDateKey(today);
  const dayCount = Math.min(MAX_DAYS, Math.max(1, diffInDays(parseDateKey(startKey), parseDateKey(endKey)) + 1));
  const lastKnownKey = todayKey < endKey ? todayKey : endKey;

  const doneOn = scope
    .filter(task => task.status === 'completed')
    .map(task => ({
      key: task.completedAt ? toDateKey(new Date(task.completedAt)) : lastKnownKey,
      weight: weight(task),
    }));

  const start = parseDateKey(startKey);
  const points: BurndownPoint[] = Array.from({ length: dayCount }, (_, index) => {
    const date = toDateKey(addDays(start, index));
    const burned = doneOn.filter(item => item.key <= date).reduce((sum, item) => sum + item.weight, 0);
    return {
      date,
      ideal: Math.round(total * (1 - index / Math.max(dayCount - 1, 1)) * 100) / 100,
      remaining: date > todayKey ? null : Math.max(0, total - burned),
    };
  });

  return { unit: estimated ? 'points' : 'tasks', total, points };
};

/** One-sentence summary for screen readers: where the sprint is against the ideal line. */
export const describeBurndown = (burndown: Burndown, today: Date = new Date()): string => {
  const { points, total, unit } = burndown;
  const todayKey = toDateKey(today);
  const known = points.filter(point => point.remaining !== null);
  const current = known.at(-1);
  if (!current || points.length === 0) return `Burndown chart: ${total} ${unit} planned, the sprint has not started.`;

  const day = points.findIndex(point => point.date === current.date) + 1;
  const remaining = current.remaining ?? 0;
  const diff = Math.round((remaining - current.ideal) * 10) / 10;
  const pace = diff > 0 ? `${diff} ${unit} behind the ideal line` : diff < 0 ? `${-diff} ${unit} ahead of the ideal line` : 'on the ideal line';
  const when = current.date === todayKey ? `Day ${day} of ${points.length}` : `Day ${day} of ${points.length} (latest data)`;
  return `Burndown chart: ${remaining} of ${total} ${unit} remaining. ${when}, ${pace}.`;
};
