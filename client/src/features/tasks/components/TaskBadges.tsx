import {
  BookOpen, Bug, CalendarDays, CheckSquare, ChevronDown, ChevronsUp, CircleAlert, Clock, Equal, FlaskConical, Link2, ListChecks, ListTree, Repeat, Waypoints, Zap, type LucideIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { useWorkflow } from '@/features/workflow/hooks/useWorkflow';
import { STAGE_COLOR_META, resolveStage } from '@/features/workflow/lib/stages';
import { STATUS_META, TASK_TYPE_META } from '../constants';
import { checklistProgress } from '../lib/checklist';
import { describeDuration, formatDuration } from '@/features/time/lib/duration';
import { formatDate, isOverdue } from '../lib/date';
import { describeRecurrence, shortRecurrence } from '../lib/recurrence';
import type { ChecklistItem, TaskPriority, TaskRecurrence, TaskStatus, TaskType } from '../types';

export const StatusDot = ({ status, className }: { status: TaskStatus; className?: string }) => (
  <span aria-hidden className={cn('inline-block size-2 shrink-0 rounded-full', STATUS_META[status].dot, className)} />
);

interface StatusBadgeProps {
  status: TaskStatus;
  /**
   * Stage key of the task ('' = not set). Pass it (`stage={task.stage ?? ''}`) to show the workspace stage name
   * with its colored dot; without it the plain status label is shown.
   */
  stage?: string;
  className?: string;
}

export const StatusBadge = ({ status, stage, className }: StatusBadgeProps) => {
  const { t } = useTranslation('tasks');
  const { stages, loaded } = useWorkflow();
  if (loaded && stage !== undefined) {
    const current = resolveStage({ status, stage }, stages);
    return (
      <span className={cn('inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700', className)}>
        <span aria-hidden className={cn('inline-block size-2 shrink-0 rounded-full', STAGE_COLOR_META[current.color].dot)} />
        {current.name}
      </span>
    );
  }
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium', STATUS_META[status].badge, className)}>
      {t(`status.${status}`)}
    </span>
  );
};

/** Jira-style glyph per priority; every tone passes AA on white. */
const PRIORITY_VISUALS: Record<TaskPriority, { icon: LucideIcon; text: string }> = {
  high: { icon: ChevronsUp, text: 'text-danger-fg' },
  medium: { icon: Equal, text: 'text-warning-fg' },
  low: { icon: ChevronDown, text: 'text-slate-500' },
};

interface PriorityIndicatorProps {
  priority: TaskPriority;
  /** Icon only (board cards); the label stays available to screen readers. */
  iconOnly?: boolean;
  className?: string;
}

export const PriorityIndicator = ({ priority, iconOnly = false, className }: PriorityIndicatorProps) => {
  const { icon: Icon, text } = PRIORITY_VISUALS[priority];
  const { t } = useTranslation('tasks');
  const label = t(`priority.${priority}`);
  const titled = t(`priority.titled.${priority}`);
  return (
    <span
      className={cn('inline-flex items-center gap-1 text-xs font-medium', text, className)}
      title={iconOnly ? titled : undefined}
    >
      <Icon aria-hidden className="size-4 shrink-0" strokeWidth={2.25} />
      <span className={cn(iconOnly && 'sr-only')}>{label}</span>
      {iconOnly && <span className="sr-only">{t('priority.suffix')}</span>}
    </span>
  );
};

interface DueDateProps {
  deadline: string;
  completed?: boolean;
  className?: string;
}

/** Due date with an overdue state (red) for unfinished tasks. */
export const DueDate = ({ deadline, completed = false, className }: DueDateProps) => {
  const { t } = useTranslation('tasks');
  const overdue = isOverdue(deadline, completed);
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs tabular-nums', overdue ? 'font-medium text-danger-fg' : 'text-slate-500', className)}>
      {overdue ? <CircleAlert className="size-3" aria-hidden /> : <CalendarDays className="size-3" aria-hidden />}
      {formatDate(deadline)}
      {overdue && <span className="sr-only"> {t('badges.overdue')}</span>}
    </span>
  );
};

/** Number of prerequisites, hidden when there are none. */
export const DependencyCount = ({ count, className }: { count: number; className?: string }) => {
  const { t } = useTranslation('tasks');
  return count > 0 ? (
    <span className={cn('inline-flex shrink-0 items-center gap-1 text-xs text-slate-500', className)} title={t('badges.dependencies')}>
      <Link2 className="size-3" aria-hidden />
      {count}
      <span className="sr-only">{t('badges.dependenciesSr')}</span>
    </span>
  ) : null;
};

/** Number of typed links (relates, duplicates, clones) to other tasks, hidden when there are none. */
export const RelationCount = ({ count, className }: { count: number; className?: string }) => {
  const { t } = useTranslation('tasks');
  return count > 0 ? (
    <span className={cn('inline-flex shrink-0 items-center gap-1 text-xs text-slate-500', className)} title={t('badges.linkedWork')}>
      <Waypoints className="size-3" aria-hidden />
      {count}
      <span className="sr-only">{t('badges.linkedTasks', { count })}</span>
    </span>
  ) : null;
};

const TYPE_ICONS: Record<TaskType, LucideIcon> = {
  story: BookOpen,
  task: CheckSquare,
  bug: Bug,
  spike: FlaskConical,
  epic: Zap,
};

/** Colored glyph of a work item type; tasks without a type count as plain tasks. */
export const TaskTypeIcon = ({ type = 'task', className }: { type?: TaskType; className?: string }) => {
  const { t } = useTranslation('tasks');
  const Icon = TYPE_ICONS[type];
  const label = t(`type.${type}`);
  const { text } = TASK_TYPE_META[type];
  return (
    <span role="img" aria-label={label} title={label} className="inline-flex shrink-0">
      <Icon className={cn('size-3.5', text, className)} aria-hidden />
    </span>
  );
};

/** Type icon with its name, for headers and details. */
export const TaskTypeBadge = ({ type = 'task', className }: { type?: TaskType; className?: string }) => {
  const { t } = useTranslation('tasks');
  const Icon = TYPE_ICONS[type];
  const label = t(`type.${type}`);
  const { badge } = TASK_TYPE_META[type];
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium', badge, className)}>
      <Icon className="size-3.5" aria-hidden />
      {label}
    </span>
  );
};

/** Story point estimate pill, hidden while the task is not estimated. */
export const StoryPoints = ({ points, className }: { points?: number | null; className?: string }) => {
  const { t } = useTranslation('tasks');
  return points === null || points === undefined ? null : (
    <span
      role="img"
      aria-label={t('badges.storyPoints', { count: points })}
      className={cn('inline-flex shrink-0 items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 tabular-nums', className)}
    >
      {t('badges.pointsShort', { count: points })}
    </span>
  );
};

interface SubtaskProgressProps {
  done: number;
  total: number;
  className?: string;
}

/** "2/5" with a thin bar; hidden when the task has no subtasks. */
export const SubtaskProgress = ({ done, total, className }: SubtaskProgressProps) => {
  const { t } = useTranslation('tasks');
  if (total <= 0) return null;
  const percent = Math.round((done / total) * 100);
  return (
    <span
      className={cn('inline-flex shrink-0 items-center gap-1.5 text-xs text-slate-500 tabular-nums', className)}
      title={t('badges.subtasks')}
    >
      <ListTree className="size-3" aria-hidden />
      <span aria-hidden className="h-1.5 w-8 overflow-hidden rounded-full bg-slate-200">
        <span className={cn('block h-full rounded-full', done === total ? 'bg-success-dot' : 'bg-primary')} style={{ width: `${percent}%` }} />
      </span>
      <span aria-hidden>{done}/{total}</span>
      <span className="sr-only">{t('badges.subtasksDone', { done, total })}</span>
    </span>
  );
};

/** ListChecks icon with "3/5"; hidden while the checklist is empty. */
export const ChecklistBadge = ({ items, className }: { items?: readonly ChecklistItem[] | null; className?: string }) => {
  const { t } = useTranslation('tasks');
  const { done, total } = checklistProgress(items);
  if (total === 0) return null;
  return (
    <span
      className={cn('inline-flex shrink-0 items-center gap-1 text-xs tabular-nums', done === total ? 'text-success-fg' : 'text-slate-500', className)}
      title={t('badges.checklist')}
    >
      <ListChecks className="size-3" aria-hidden />
      <span aria-hidden>{done}/{total}</span>
      <span className="sr-only">{t('badges.checklistDone', { done, total })}</span>
    </span>
  );
};

/**
 * Logged time against the estimate ("1h 30m / 2h"), hidden while a task has neither. Over the estimate it turns warning
 * and says so to screen readers.
 */
export const TimeBadge = ({ logged, estimate, className }: { logged?: number | null; estimate?: number | null; className?: string }) => {
  const { t } = useTranslation('tasks');
  const spent = logged ?? 0;
  if (spent <= 0 && !estimate) return null;
  const over = Boolean(estimate) && spent > (estimate ?? 0);
  const text = estimate ? (spent > 0 ? `${formatDuration(spent)} / ${formatDuration(estimate)}` : t('badges.estimated', { value: formatDuration(estimate) })) : formatDuration(spent);
  const spoken = estimate
    ? t(over ? 'badges.loggedOfEstimatedOver' : 'badges.loggedOfEstimated', { logged: describeDuration(spent), estimate: describeDuration(estimate) })
    : t('badges.logged', { logged: describeDuration(spent) });
  return (
    <span
      className={cn('inline-flex shrink-0 items-center gap-1 text-xs tabular-nums', over ? 'font-medium text-warning-fg' : 'text-slate-500', className)}
      title={spoken}
    >
      <Clock className="size-3" aria-hidden />
      <span aria-hidden>{text}</span>
      <span className="sr-only">{spoken}</span>
    </span>
  );
};

/** Repeat icon for tasks that recur; the rule is in the tooltip and read out to screen readers. */
export const RepeatBadge = ({ recurrence, className }: { recurrence?: TaskRecurrence | null; className?: string }) => {
  const { t } = useTranslation('tasks');
  return recurrence ? (
    <span
      className={cn('inline-flex shrink-0 items-center gap-1 text-xs text-slate-500', className)}
      title={describeRecurrence(recurrence)}
    >
      <Repeat className="size-3" aria-hidden />
      <span className="sr-only">{t('badges.repeats', { rule: shortRecurrence(recurrence) })}</span>
    </span>
  ) : null;
};
