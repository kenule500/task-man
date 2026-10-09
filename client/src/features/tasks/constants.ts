import type { TaskPriority, TaskSort, TaskStatus, TaskType, TaskView } from './types';

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

interface PriorityMeta {
  label: string;
  text: string;
  dot: string;
  /** Top accent of board cards */
  accent: string;
  rank: number;
}

export const PRIORITY_META: Record<TaskPriority, PriorityMeta> = {
  high: { label: 'High', text: 'text-red-600', dot: 'bg-red-500', accent: 'border-t-red-400', rank: 1 },
  medium: { label: 'Medium', text: 'text-amber-700', dot: 'bg-amber-500', accent: 'border-t-amber-400', rank: 2 },
  low: { label: 'Low', text: 'text-emerald-700', dot: 'bg-emerald-500', accent: 'border-t-emerald-400', rank: 3 },
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


export const TASK_TYPES: TaskType[] = ['story', 'task', 'bug', 'spike'];

interface TypeMeta {
  label: string;
  /** Icon color (AA on white) */
  text: string;
  /** Soft badge surface */
  badge: string;
  dot: string;
}

export const TASK_TYPE_META: Record<TaskType, TypeMeta> = {
  story: { label: 'Story', text: 'text-emerald-700', badge: 'bg-emerald-50 text-emerald-700 border-emerald-100', dot: 'bg-emerald-500' },
  task: { label: 'Task', text: 'text-blue-700', badge: 'bg-blue-50 text-blue-700 border-blue-100', dot: 'bg-blue-600' },
  bug: { label: 'Bug', text: 'text-red-700', badge: 'bg-red-50 text-red-700 border-red-100', dot: 'bg-red-500' },
  spike: { label: 'Spike', text: 'text-violet-700', badge: 'bg-violet-50 text-violet-700 border-violet-100', dot: 'bg-violet-500' },
};

export const TASK_TYPE_OPTIONS: SelectOption<TaskType>[] = TASK_TYPES.map(type => ({
  value: type,
  label: TASK_TYPE_META[type].label,
  dot: TASK_TYPE_META[type].dot,
}));

/** Planning-poker scale offered when estimating; the API accepts any whole number 0-100. */
export const STORY_POINT_SCALE = [0, 1, 2, 3, 5, 8, 13, 21] as const;
