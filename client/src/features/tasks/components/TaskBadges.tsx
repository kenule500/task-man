import { CalendarDays, Link2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PRIORITY_META, STATUS_META } from '../constants';
import { formatDate, isOverdue } from '../lib/date';
import type { TaskPriority, TaskStatus } from '../types';

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
