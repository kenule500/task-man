import type { TaskPriority, TaskSort, TaskStatus, TaskView } from './types';

export interface SelectOption<T extends string> {
  value: T;
  label: string;
  /** Tailwind background class of the leading dot */
  dot?: string;
  /** Classes applied to a compact (inline) trigger while this option is selected */
  tone?: string;
}

/** Workflow order: Pending > In Progress > Completed. */
export const TASK_STATUSES: TaskStatus[] = ['pending', 'in-progress', 'completed'];
export const TASK_PRIORITIES: TaskPriority[] = ['high', 'medium', 'low'];

interface StatusMeta {
  label: string;
  /** Pill used in tables and cards */
  badge: string;
  /** Small solid marker (dots, bars, column accents) */
  dot: string;
  /** Soft surface for chips and Gantt bars */
  surface: string;
}

export const STATUS_META: Record<TaskStatus, StatusMeta> = {
  pending: {
    label: 'Pending',
    badge: 'bg-slate-100 text-slate-700 border-slate-200',
    dot: 'bg-slate-400',
    surface: 'bg-slate-100 border-slate-300 text-slate-700',
  },
  'in-progress': {
    label: 'In Progress',
    badge: 'bg-blue-50 text-blue-700 border-blue-100',
    dot: 'bg-blue-600',
    surface: 'bg-blue-50 border-blue-300 text-blue-800',
  },
  completed: {
    label: 'Completed',
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    dot: 'bg-emerald-500',
    surface: 'bg-emerald-50 border-emerald-300 text-emerald-800',
  },
};

export const PRIORITY_META: Record<TaskPriority, { label: string; text: string; dot: string; rank: number }> = {
  high: { label: 'High', text: 'text-red-600', dot: 'bg-red-500', rank: 1 },
  medium: { label: 'Medium', text: 'text-amber-600', dot: 'bg-amber-500', rank: 2 },
  low: { label: 'Low', text: 'text-emerald-600', dot: 'bg-emerald-500', rank: 3 },
};

export const STATUS_OPTIONS: SelectOption<TaskStatus>[] = TASK_STATUSES.map(status => ({
  value: status,
  label: STATUS_META[status].label,
  dot: STATUS_META[status].dot,
  tone: `border ${STATUS_META[status].badge}`,
}));

export const PRIORITY_OPTIONS: SelectOption<TaskPriority>[] = TASK_PRIORITIES.map(priority => ({
  value: priority,
  label: PRIORITY_META[priority].label,
  dot: PRIORITY_META[priority].dot,
  tone: `font-medium ${PRIORITY_META[priority].text}`,
}));

export const SORT_OPTIONS: SelectOption<TaskSort>[] = [
  { value: 'createdAt', label: 'Newest' },
  { value: 'deadline', label: 'By Deadline' },
  { value: 'priority', label: 'By Priority' },
];

export const TASK_VIEWS: TaskView[] = ['list', 'board', 'calendar', 'timeline'];
