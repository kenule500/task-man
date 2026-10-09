// Color-coded dots for the calendar: one dot per task due on a day, ordered by
// urgency (overdue first), capped at three with a "+N" overflow, plus a plain
// text summary so the color is never the only signal.
import { STATUS_META } from '../constants';
import { dateKeyOf, todayKey } from './date';
import type { Task } from '../types';

export type DotState = 'overdue' | 'pending' | 'in-progress' | 'completed';

/** Urgency order: what needs attention comes first. */
export const DOT_STATES: DotState[] = ['overdue', 'pending', 'in-progress', 'completed'];

/** Dots shown per day before the "+N" overflow. */
export const MAX_DOTS = 3;

interface DotMeta {
  /** Full wording, used in accessible summaries ("2 in progress"). */
  summary: string;
  /** Short wording of the legend. */
  legend: string;
  /** Tailwind background class of the dot */
  dot: string;
}

export const DOT_META: Record<DotState, DotMeta> = {
  overdue: { summary: 'overdue', legend: 'Overdue', dot: 'bg-red-600' },
  pending: { summary: 'pending', legend: STATUS_META.pending.label, dot: STATUS_META.pending.dot },
  'in-progress': { summary: 'in progress', legend: 'In progress', dot: STATUS_META['in-progress'].dot },
  completed: { summary: 'completed', legend: 'Done', dot: STATUS_META.completed.dot },
};

export interface CalendarDot {
  state: DotState;
  /** Tailwind background class */
  className: string;
}

export interface DaySummary {
  /** At most {@link MAX_DOTS}, most urgent first. */
  dots: CalendarDot[];
  /** Tasks beyond the shown dots. */
  overflow: number;
  total: number;
  counts: Record<DotState, number>;
  /** "2 in progress, 1 completed, 1 overdue", empty when nothing is due. */
  summary: string;
}

/** Overdue (not completed and due before today) wins over the task's own status. */
export const dotStateOf = (task: Pick<Task, 'status' | 'deadline'>, today = todayKey()): DotState => {
  if (task.status === 'completed') return 'completed';
  return dateKeyOf(task.deadline) < today ? 'overdue' : task.status;
};

/** Dots, overflow and accessible summary for the tasks due on one day. */
export const summarizeDay = (tasks: readonly Pick<Task, 'status' | 'deadline'>[], today = todayKey()): DaySummary => {
  const counts: Record<DotState, number> = { overdue: 0, pending: 0, 'in-progress': 0, completed: 0 };
  for (const task of tasks) counts[dotStateOf(task, today)] += 1;

  const ordered = DOT_STATES.flatMap(state => Array.from({ length: counts[state] }, () => state));
  const dots = ordered.slice(0, MAX_DOTS).map(state => ({ state, className: DOT_META[state].dot }));
  // Summary lists states in the same order as the dots; zero counts are skipped.
  const summary = DOT_STATES.filter(state => counts[state] > 0)
    .map(state => `${counts[state]} ${DOT_META[state].summary}`)
    .join(', ');

  return { dots, overflow: Math.max(0, ordered.length - MAX_DOTS), total: ordered.length, counts, summary };
};
