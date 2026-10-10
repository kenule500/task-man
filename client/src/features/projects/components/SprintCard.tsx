import { useId, type ReactNode } from 'react';
import { CalendarDays, ChevronDown, ListTodo, Pencil, Play, Flag, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EmptyState, ProgressBar, Surface, Tag } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { dateKeyOf, formatDate, type Task } from '@/features/tasks';
import type { Sprint } from '../types';
import { buildBurndown } from '../lib/burndown';
import {
  describeDaysLeft, describeProgress, formatSprintRange, isSprintLate, workProgress,
} from '../lib/sprintStats';
import BurndownChart from './BurndownChart';
import QuickAdd from './QuickAdd';
import TaskList from './TaskList';

interface SprintCardProps {
  sprint: Sprint;
  /** Top-level tasks of the sprint. */
  tasks: Task[];
  subtasks: Map<string, Task[]>;
  expanded: boolean;
  onToggle: () => void;
  /** Holds `projects:write`: start, complete, edit and delete the sprint. */
  canManage: boolean;
  /** Holds `tasks:write`: add tasks and tick subtasks. */
  canWriteTasks: boolean;
  /** Another sprint of the project is running, so this one cannot start. */
  blockedByActive: boolean;
  starting?: boolean;
  onStart: (sprint: Sprint) => void;
  onComplete: (sprint: Sprint) => void;
  onEdit: (sprint: Sprint) => void;
  onDelete: (sprint: Sprint) => void;
  onOpenTask: (task: Task) => void;
  onToggleSubtask: (subtask: Task, done: boolean) => void;
  onQuickAdd: (title: string) => Promise<unknown>;
}

const STATUS_TAG = {
  planned: { tone: 'neutral', label: 'Planned' },
  active: { tone: 'primary', label: 'Active' },
  completed: { tone: 'success', label: 'Completed' },
} as const;

const Meta = ({ icon, children, className }: { icon: ReactNode; children: ReactNode; className?: string }) => (
  <span className={cn('inline-flex items-center gap-1.5 text-xs tabular-nums text-slate-600', className)}>
    <span aria-hidden className="[&_svg]:size-3.5">{icon}</span>
    {children}
  </span>
);

const iconButton = 'size-11 text-slate-600 hover:bg-slate-100 md:size-8';

/** One sprint: dates, goal, progress, actions and (when expanded) its tasks. The active sprint also shows a burndown. */
const SprintCard = ({
  sprint, tasks, subtasks, expanded, onToggle, canManage, canWriteTasks, blockedByActive, starting = false,
  onStart, onComplete, onEdit, onDelete, onOpenTask, onToggleSubtask, onQuickAdd,
}: SprintCardProps) => {
  const headingId = useId();
  const panelId = useId();
  const hintId = useId();
  const progress = workProgress(tasks);
  const status = STATUS_TAG[sprint.status];
  const late = isSprintLate(sprint);
  const burndown = sprint.status === 'active' ? buildBurndown(sprint, tasks) : null;
  const canAddTasks = canWriteTasks && sprint.status !== 'completed';

  return (
    <Surface
      as="section"
      padding="none"
      aria-labelledby={headingId}
      className={cn('overflow-hidden', sprint.status === 'active' && 'border-blue-200 ring-1 ring-blue-100')}
    >
      <div className="space-y-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 id={headingId} className="min-w-0 text-base font-bold text-slate-900">
                <button
                  type="button"
                  onClick={onToggle}
                  aria-expanded={expanded}
                  aria-controls={panelId}
                  className="-ml-1 flex min-h-11 max-w-full items-center gap-1.5 rounded-lg px-1 text-left hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-primary md:min-h-8"
                >
                  <ChevronDown aria-hidden className={cn('size-4 shrink-0 text-slate-500 transition-transform motion-reduce:transition-none', !expanded && '-rotate-90')} />
                  <span className="min-w-0 truncate" title={sprint.name}>{sprint.name}</span>
                </button>
              </h3>
              <Tag tone={status.tone} size="sm">{status.label}</Tag>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
              <Meta icon={<CalendarDays />}>{formatSprintRange(sprint)}</Meta>
              {sprint.status === 'active' && (
                <Meta icon={<Flag />} className={cn(late && 'font-semibold text-red-600')}>{describeDaysLeft(sprint)}</Meta>
              )}
              {sprint.status === 'completed' && (
                <Meta icon={<Flag />}>
                  {sprint.completedPoints ?? 0} points delivered
                  {sprint.completedAt && <> · done {formatDate(dateKeyOf(sprint.completedAt), { month: 'short', day: 'numeric' })}</>}
                </Meta>
              )}
              <Meta icon={<ListTodo />}>{tasks.length} {tasks.length === 1 ? 'task' : 'tasks'}</Meta>
            </div>
          </div>

          {canManage && sprint.status !== 'completed' && (
            <div className="flex shrink-0 flex-wrap items-center gap-1">
              {sprint.status === 'active' && (
                <Button onClick={() => onComplete(sprint)} className="h-11 gap-2 rounded-lg bg-primary px-3 text-sm text-white hover:bg-primary-hover md:h-8">
                  <Flag className="size-4" aria-hidden /> Complete sprint
                </Button>
              )}
              {sprint.status === 'planned' && (
                <Button
                  onClick={() => onStart(sprint)}
                  disabled={blockedByActive || starting}
                  aria-describedby={blockedByActive ? hintId : undefined}
                  className="h-11 gap-2 rounded-lg bg-primary px-3 text-sm text-white hover:bg-primary-hover md:h-8"
                >
                  <Play className="size-4" aria-hidden /> {starting ? 'Starting...' : 'Start sprint'}
                </Button>
              )}
              <Button variant="ghost" size="icon-sm" onClick={() => onEdit(sprint)} aria-label={`Edit ${sprint.name}`} className={iconButton}>
                <Pencil />
              </Button>
              {sprint.status === 'planned' && (
                <Button variant="ghost" size="icon-sm" onClick={() => onDelete(sprint)} aria-label={`Delete ${sprint.name}`} className={cn(iconButton, 'hover:bg-red-50 hover:text-red-600')}>
                  <Trash2 />
                </Button>
              )}
            </div>
          )}
        </div>

        {blockedByActive && canManage && sprint.status === 'planned' && (
          <p id={hintId} className="text-xs text-slate-600">Complete the active sprint before starting this one.</p>
        )}

        {sprint.goal && <p className="text-sm text-slate-700"><span className="font-semibold">Goal:</span> {sprint.goal}</p>}

        {sprint.status !== 'completed' && (
          <div>
            <div className="mb-1 flex justify-between text-xs text-slate-600">
              <span>Progress</span>
              <span className="tabular-nums">{describeProgress(progress)}</span>
            </div>
            <ProgressBar value={progress.percent} label={`${sprint.name} progress`} showValue />
          </div>
        )}
      </div>

      {expanded && (
        <div id={panelId} className="border-t border-slate-100">
          {burndown && burndown.total > 0 && (
            <div className="border-b border-slate-100 p-4 sm:p-5">
              <h4 className="mb-2 text-sm font-semibold text-slate-900">Burndown</h4>
              <BurndownChart burndown={burndown} title={`${sprint.name} burndown`} />
            </div>
          )}
          {canAddTasks && <QuickAdd label={`Add a story to ${sprint.name}…`} onAdd={onQuickAdd} />}
          <TaskList
            label={`Tasks in ${sprint.name}`}
            tasks={tasks}
            subtasks={subtasks}
            canWrite={canWriteTasks}
            onOpen={onOpenTask}
            onToggleSubtask={onToggleSubtask}
            empty={(
              <EmptyState
                className="py-8 sm:py-10"
                icon={<ListTodo />}
                title="No tasks in this sprint"
                description={sprint.status === 'completed'
                  ? 'No finished tasks were kept in this sprint.'
                  : 'Add a story above, or move tasks here from the backlog.'}
              />
            )}
          />
        </div>
      )}
    </Surface>
  );
};

export default SprintCard;
