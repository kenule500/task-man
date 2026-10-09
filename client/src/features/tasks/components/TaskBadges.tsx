import { BookOpen, Bug, CalendarDays, CheckSquare, FlaskConical, Link2, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PRIORITY_META, STATUS_META, TASK_TYPE_META } from '../constants';
import { formatDate, isOverdue } from '../lib/date';
import type { TaskPriority, TaskStatus, TaskType } from '../types';

export const StatusDot = ({ status, className }: { status: TaskStatus; className?: string }) => (
  <span aria-hidden className={cn('inline-block size-2 shrink-0 rounded-full', STATUS_META[status].dot, className)} />
);

export const StatusBadge = ({ status, className }: { status: TaskStatus; className?: string }) => (
  <span className={cn('inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium', STATUS_META[status].badge, className)}>
    {STATUS_META[status].label}
  </span>
);

export const PriorityIndicator = ({ priority, className }: { priority: TaskPriority; className?: string }) => (
  <span className={cn('inline-flex items-center gap-1.5 text-xs font-medium', PRIORITY_META[priority].text, className)}>
    <span aria-hidden className={cn('size-1.5 rounded-full', PRIORITY_META[priority].dot)} />
    {PRIORITY_META[priority].label}
  </span>
);

interface DueDateProps {
  deadline: string;
  completed?: boolean;
  className?: string;
}

/** Due date with an overdue state (red) for unfinished tasks. */
export const DueDate = ({ deadline, completed = false, className }: DueDateProps) => {
  const overdue = isOverdue(deadline, completed);
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs tabular-nums', overdue ? 'font-medium text-red-600' : 'text-slate-500', className)}>
      <CalendarDays className="size-3" aria-hidden />
      {formatDate(deadline)}
      {overdue && <span className="sr-only"> (overdue)</span>}
    </span>
  );
};

/** Number of prerequisites, hidden when there are none. */
export const DependencyCount = ({ count, className }: { count: number; className?: string }) =>
  count > 0 ? (
    <span className={cn('inline-flex shrink-0 items-center gap-1 text-xs text-slate-400', className)} title="Dependencies">
      <Link2 className="size-3" aria-hidden />
      {count}
      <span className="sr-only">dependencies</span>
    </span>
  ) : null;

const TYPE_ICONS: Record<TaskType, LucideIcon> = {
  story: BookOpen,
  task: CheckSquare,
  bug: Bug,
  spike: FlaskConical,
};

/** Colored glyph of a work item type; tasks without a type count as plain tasks. */
export const TaskTypeIcon = ({ type = 'task', className }: { type?: TaskType; className?: string }) => {
  const Icon = TYPE_ICONS[type];
  const { label, text } = TASK_TYPE_META[type];
  return (
    <span role="img" aria-label={label} title={label} className="inline-flex shrink-0">
      <Icon className={cn('size-3.5', text, className)} aria-hidden />
    </span>
  );
};

/** Type icon with its name, for headers and details. */
export const TaskTypeBadge = ({ type = 'task', className }: { type?: TaskType; className?: string }) => {
  const Icon = TYPE_ICONS[type];
  const { label, badge } = TASK_TYPE_META[type];
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium', badge, className)}>
      <Icon className="size-3.5" aria-hidden />
      {label}
    </span>
  );
};

/** Story point estimate pill, hidden while the task is not estimated. */
export const StoryPoints = ({ points, className }: { points?: number | null; className?: string }) =>
  points === null || points === undefined ? null : (
    <span
      role="img"
      aria-label={`${points} story ${points === 1 ? 'point' : 'points'}`}
      className={cn('inline-flex shrink-0 items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 tabular-nums', className)}
    >
      {points} {points === 1 ? 'pt' : 'pts'}
    </span>
  );

interface SubtaskProgressProps {
  done: number;
  total: number;
  className?: string;
}

/** "2/5" with a thin bar; hidden when the task has no subtasks. */
export const SubtaskProgress = ({ done, total, className }: SubtaskProgressProps) => {
  if (total <= 0) return null;
  const percent = Math.round((done / total) * 100);
  return (
    <span
      className={cn('inline-flex shrink-0 items-center gap-1.5 text-xs text-slate-500 tabular-nums', className)}
      title="Subtasks"
    >
      <span aria-hidden className="h-1.5 w-8 overflow-hidden rounded-full bg-slate-200">
        <span className={cn('block h-full rounded-full', done === total ? 'bg-emerald-500' : 'bg-primary')} style={{ width: `${percent}%` }} />
      </span>
      <span aria-hidden>{done}/{total}</span>
      <span className="sr-only">{done} of {total} subtasks done</span>
    </span>
  );
};
