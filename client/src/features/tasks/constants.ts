import i18n from '@/i18n';
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
    get label() { return i18n.t('tasks:status.pending'); },
    badge: 'bg-slate-100 text-slate-700 border-slate-200',
    dot: 'bg-slate-400',
    surface: 'bg-slate-100 border-slate-300 text-slate-700',
  },
  'in-progress': {
    get label() { return i18n.t('tasks:status.in-progress'); },
    badge: 'bg-blue-50 text-blue-700 border-blue-100',
    dot: 'bg-blue-600',
    surface: 'bg-blue-50 border-blue-300 text-blue-800',
  },
  completed: {
    get label() { return i18n.t('tasks:status.completed'); },
    badge: 'bg-success-bg text-success-fg border-success-border',
    dot: 'bg-success-dot',
    surface: 'bg-success-bg border-success-border text-success-fg',
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
  high: { get label() { return i18n.t('tasks:priority.high'); }, text: 'text-danger-fg', dot: 'bg-danger-dot', accent: 'border-t-danger-dot', rank: 1 },
  medium: { get label() { return i18n.t('tasks:priority.medium'); }, text: 'text-warning-fg', dot: 'bg-warning-dot', accent: 'border-t-warning-dot', rank: 2 },
  low: { get label() { return i18n.t('tasks:priority.low'); }, text: 'text-success-fg', dot: 'bg-success-dot', accent: 'border-t-success-dot', rank: 3 },
};

export const STATUS_OPTIONS: SelectOption<TaskStatus>[] = TASK_STATUSES.map(status => ({
  value: status,
  get label() { return STATUS_META[status].label; },
  dot: STATUS_META[status].dot,
  tone: `border ${STATUS_META[status].badge}`,
}));

export const PRIORITY_OPTIONS: SelectOption<TaskPriority>[] = TASK_PRIORITIES.map(priority => ({
  value: priority,
  get label() { return PRIORITY_META[priority].label; },
  dot: PRIORITY_META[priority].dot,
  tone: `font-medium ${PRIORITY_META[priority].text}`,
}));

export const SORT_OPTIONS: SelectOption<TaskSort>[] = [
  { value: 'createdAt', get label() { return i18n.t('tasks:sort.createdAt'); } },
  { value: 'deadline', get label() { return i18n.t('tasks:sort.deadline'); } },
  { value: 'priority', get label() { return i18n.t('tasks:sort.priority'); } },
];

export const TASK_VIEWS: TaskView[] = ['list', 'board', 'calendar', 'timeline'];


export const TASK_TYPES: TaskType[] = ['story', 'task', 'bug', 'spike', 'epic'];

interface TypeMeta {
  label: string;
  /** Icon color (AA on white) */
  text: string;
  /** Soft badge surface */
  badge: string;
  dot: string;
}

export const TASK_TYPE_META: Record<TaskType, TypeMeta> = {
  story: { get label() { return i18n.t('tasks:type.story'); }, text: 'text-success-fg', badge: 'bg-success-bg text-success-fg border-success-border', dot: 'bg-success-dot' },
  task: { get label() { return i18n.t('tasks:type.task'); }, text: 'text-blue-700', badge: 'bg-blue-50 text-blue-700 border-blue-100', dot: 'bg-blue-600' },
  bug: { get label() { return i18n.t('tasks:type.bug'); }, text: 'text-danger-fg', badge: 'bg-danger-bg text-danger-fg border-danger-border', dot: 'bg-danger-dot' },
  spike: { get label() { return i18n.t('tasks:type.spike'); }, text: 'text-violet-700', badge: 'bg-violet-50 text-violet-700 border-violet-100', dot: 'bg-violet-500' },
  // Fuchsia stays apart from the blue / violet of tasks and spikes (-700 on -50 is AA)
  epic: { get label() { return i18n.t('tasks:type.epic'); }, text: 'text-fuchsia-700', badge: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-100', dot: 'bg-fuchsia-500' },
};

export const TASK_TYPE_OPTIONS: SelectOption<TaskType>[] = TASK_TYPES.map(type => ({
  value: type,
  get label() { return TASK_TYPE_META[type].label; },
  dot: TASK_TYPE_META[type].dot,
}));

/** Planning-poker scale offered when estimating; the API accepts any whole number 0-100. */
export const STORY_POINT_SCALE = [0, 1, 2, 3, 5, 8, 13, 21] as const;
