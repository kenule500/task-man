import { useId, useState, type ReactNode } from 'react';
import { ChevronRight, ListChecks } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';
import { AssigneeStack, DueDate, StatusBadge, type Task } from '@/features/tasks';
import { subtaskProgress } from '../lib/grouping';
import { TASK_TYPE_META } from '../lib/icons';

interface TaskRowProps {
  task: Task;
  subtasks?: Task[];
  canWrite: boolean;
  onOpen: (task: Task) => void;
  /** Marks a subtask done / not done. */
  onToggleSubtask: (subtask: Task, done: boolean) => void;
  /** Extra control on the right (e.g. "Move to sprint"). */
  trailing?: ReactNode;
}

export const TaskTypeIcon = ({ type = 'task', className }: { type?: Task['type']; className?: string }) => {
  const meta = TASK_TYPE_META[type ?? 'task'];
  const Icon = meta.icon;
  return (
    <span className={cn('flex size-6 shrink-0 items-center justify-center', className)}>
      <Icon aria-hidden className={cn('size-4', meta.color)} />
      <span className="sr-only">{meta.label}</span>
    </span>
  );
};

/** Title that opens the details; stretched over the row so the whole row is clickable with one tab stop. */
const openButtonClass = 'text-left outline-none after:absolute after:inset-0 focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-primary';

/**
 * One story / task / bug / spike with its meta. Rows with subtasks expand to list them,
 * each with a checkbox. The row itself opens the task details.
 */
const TaskRow = ({ task, subtasks = [], canWrite, onOpen, onToggleSubtask, trailing }: TaskRowProps) => {
  const [expanded, setExpanded] = useState(false);
  const panelId = useId();
  const progress = subtaskProgress(subtasks);
  const done = task.status === 'completed';

  return (
    <li className="border-b border-slate-100 last:border-b-0">
      <div className="relative flex items-start gap-1 px-2 py-3 hover:bg-slate-50 sm:gap-2 sm:px-4">
        {subtasks.length > 0 ? (
          <button
            type="button"
            onClick={() => setExpanded(open => !open)}
            aria-expanded={expanded}
            aria-controls={panelId}
            aria-label={`${expanded ? 'Hide' : 'Show'} ${progress.total} subtasks of ${task.title}`}
            className="relative z-10 -my-1 flex size-11 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-200 focus-visible:outline-2 focus-visible:outline-primary md:size-8"
          >
            <ChevronRight aria-hidden className={cn('size-4 transition-transform motion-reduce:transition-none', expanded && 'rotate-90')} />
          </button>
        ) : (
          <span aria-hidden className="size-2 shrink-0 md:size-8" />
        )}

        <TaskTypeIcon type={task.type} className="mt-px" />

        <div className="min-w-0 flex-1">
          <button type="button" onClick={() => onOpen(task)} className={cn('block max-w-full text-sm font-semibold text-slate-900', openButtonClass, done && 'text-slate-500 line-through')}>
            <span className="break-words">{task.title}</span>
          </button>
          {task.description && <p className="mt-0.5 line-clamp-2 text-xs text-slate-600">{task.description}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <StatusBadge status={task.status} className="px-2 py-0.5" />
            {typeof task.storyPoints === 'number' && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold tabular-nums text-slate-700">
                {task.storyPoints}<span aria-hidden> pts</span>
                <span className="sr-only"> story points</span>
              </span>
            )}
            {progress.total > 0 && (
              <span className="inline-flex items-center gap-1 text-xs font-medium tabular-nums text-slate-600">
                <ListChecks aria-hidden className="size-3.5" />
                {progress.done}/{progress.total}
                <span className="sr-only"> subtasks done</span>
              </span>
            )}
            <DueDate deadline={task.deadline} completed={done} />
            <AssigneeStack users={task.assignees} />
          </div>
        </div>

        {trailing && <div className="relative z-10 shrink-0 self-center">{trailing}</div>}
      </div>

      {expanded && subtasks.length > 0 && (
        <ul id={panelId} aria-label={`Subtasks of ${task.title}`} className="border-t border-slate-100 bg-slate-50/70 py-1 pl-8 pr-2 sm:pl-16 sm:pr-4">
          {subtasks.map(subtask => {
            const subDone = subtask.status === 'completed';
            return (
              <li key={subtask._id} className="relative flex items-start gap-1 rounded-lg py-1.5 hover:bg-slate-100/70">
                <span className="relative z-10 flex size-11 shrink-0 items-center justify-center md:size-8">
                  <Checkbox
                    checked={subDone}
                    disabled={!canWrite}
                    onCheckedChange={checked => onToggleSubtask(subtask, Boolean(checked))}
                    aria-label={`Mark "${subtask.title}" as done`}
                  />
                </span>
                <div className="min-w-0 flex-1 pt-2.5 md:pt-1.5">
                  <button type="button" onClick={() => onOpen(subtask)} className={cn('block max-w-full text-sm font-medium text-slate-800', openButtonClass, subDone && 'text-slate-500 line-through')}>
                    <span className="break-words">{subtask.title}</span>
                  </button>
                  {subtask.description && <p className="mt-0.5 line-clamp-2 text-xs text-slate-600">{subtask.description}</p>}
                </div>
                <StatusBadge status={subtask.status} className="mr-1 mt-2.5 shrink-0 px-2 py-0.5 md:mt-1.5" />
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
};

export default TaskRow;
