import { useMemo } from 'react';
import { CheckSquare, CornerDownRight, MessageSquare, PanelRightOpen, Paperclip } from 'lucide-react';
import { cn } from '@/lib/utils';
// Deep import: the projects index imports the tasks module back
import ProjectChip from '@/features/projects/components/ProjectChip';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { EmptyState } from '@/components/ds';
import {
  DependencyCount, PriorityIndicator, StatusBadge, StoryPoints, SubtaskProgress, TaskTypeIcon,
} from '../components/TaskBadges';
import { InlineDate, InlineText } from '../components/InlineEdit';
import TaskActionsMenu from '../components/TaskActionsMenu';
import TaskKey from '../components/TaskKey';
import { AssigneeStack, LabelList } from '../components/TaskChips';
import { PrioritySelect, StatusSelect } from '../components/TaskSelects';
import { dateKeyOf, isOverdue } from '../lib/date';
import { arrangeWithSubtasks, countSubtasks, indexSubtasks, type ListEntry, type SubtaskProgressCount } from '../lib/subtasks';
import type { Task } from '../types';
import type { TaskViewProps } from './types';

const GRID = 'grid grid-cols-[2.5rem_minmax(0,1fr)_6rem_7.5rem_9.5rem_9.5rem_4.5rem] items-center gap-4';

interface ListViewProps extends TaskViewProps {
  /** Total before filtering, to tell "no tasks" apart from "no matches". */
  totalCount: number;
  /** Every task, so subtask progress and parent titles stay right while filters hide some rows. Defaults to `tasks`. */
  allTasks?: Task[];
}

/** Dense table (from `md`) or compact cards (phones), with every field editable in place. */
const ListView = ({ tasks, totalCount, allTasks, onUpdate, onEdit, onDelete, onOpen, canWrite = true, canDelete = true }: ListViewProps) => {
  const rowProps = { onUpdate, onEdit, onDelete, onOpen, canWrite, canDelete };
  const entries = useMemo(() => arrangeWithSubtasks(tasks, allTasks ?? tasks), [tasks, allTasks]);
  const children = useMemo(() => indexSubtasks(allTasks ?? tasks), [tasks, allTasks]);
  const entryProps = (entry: ListEntry) => ({
    task: entry.task,
    depth: entry.depth,
    orphanOf: entry.orphanOf,
    progress: countSubtasks(children.get(entry.task._id) ?? []),
    ...rowProps,
  });

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      {tasks.length === 0 ? (
        <EmptyState
          icon={<CheckSquare />}
          title="No tasks found"
          description={totalCount === 0
            ? "You're all caught up! Create your first task to get started."
            : 'No tasks match your current filters.'}
        />
      ) : (
        <>
          {/* Desktop and tablet: table */}
          <div data-testid="list-table" className="hidden overflow-x-auto md:block">
            <div role="table" aria-label="Tasks" className="min-w-[860px]">
              <div role="row" className={cn(GRID, 'px-6 py-4 border-b border-slate-100 bg-slate-50/50')}>
                {['Done', 'Task Name', 'Assignees', 'Priority', 'Status', 'Due Date'].map((header, i) => (
                  <div key={header} role="columnheader" className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    <span className={cn(i === 0 && 'sr-only')}>{header}</span>
                  </div>
                ))}
                <div role="columnheader"><span className="sr-only">Actions</span></div>
              </div>
              {entries.map(entry => (
                <ListRow key={entry.task._id} {...entryProps(entry)} />
              ))}
            </div>
          </div>

          {/* Phones: one card per task */}
          <ul role="list" aria-label="Tasks" data-testid="list-cards" className="divide-y divide-slate-100 md:hidden">
            {entries.map(entry => (
              <ListCard key={entry.task._id} {...entryProps(entry)} />
            ))}
          </ul>

          <div className="flex justify-between items-center px-4 py-4 bg-slate-50/50 border-t border-slate-100 md:px-6">
            <p className="text-xs text-slate-500">
              Showing <span className="font-medium text-slate-700">{tasks.length}</span> of{' '}
              <span className="font-medium text-slate-700">{totalCount}</span> tasks
            </p>
          </div>
        </>
      )}
    </div>
  );
};

type ListRowProps = Pick<TaskViewProps, 'onUpdate' | 'onEdit' | 'onDelete' | 'onOpen'> & {
  task: Task;
  canWrite: boolean;
  canDelete: boolean;
  /** 1 = subtask shown under its parent. */
  depth?: 0 | 1;
  /** Title of the parent when this subtask is shown without it. */
  orphanOf?: string;
  progress?: SubtaskProgressCount;
};

/** Opens the details dialog (falls back to the edit form when the page has none). */
const openTask = ({ task, onOpen, onEdit }: Pick<ListRowProps, 'task' | 'onOpen' | 'onEdit'>) => () => (onOpen ?? onEdit)(task);

const DetailsButton = ({ task, onOpen, onEdit, className }: Pick<ListRowProps, 'task' | 'onOpen' | 'onEdit'> & { className?: string }) => (
  <Button
    variant="ghost"
    size="icon-sm"
    aria-label={`Open details for ${task.title}`}
    onClick={openTask({ task, onOpen, onEdit })}
    className={cn('size-10 text-slate-400 hover:bg-slate-200 hover:text-slate-600 md:size-7', className)}
  >
    <PanelRightOpen />
  </Button>
);

const ListRow = ({ task, onUpdate, onEdit, onDelete, onOpen, canWrite, canDelete, depth = 0, orphanOf, progress }: ListRowProps) => {
  const completed = task.status === 'completed';
  const overdue = isOverdue(task.deadline, completed);
  const titleClass = cn('font-medium text-sm text-slate-900', completed && 'text-slate-400 line-through');
  const hoverReveal = 'md:opacity-0 md:group-hover:opacity-100 focus-visible:opacity-100 data-popup-open:opacity-100';

  return (
    <div role="row" className={cn(GRID, 'py-3 px-6 border-b border-slate-100 last:border-0 hover:bg-slate-50/50 transition-colors group')}>
      <div role="cell" className="flex items-center">
        <Checkbox
          checked={completed}
          disabled={!canWrite}
          onCheckedChange={checked => onUpdate(task._id, { status: checked ? 'completed' : 'pending' })}
          aria-label={completed ? `Mark "${task.title}" as not done` : `Mark "${task.title}" as done`}
        />
      </div>

      <div role="cell" className={cn('min-w-0 pl-2', depth === 1 && 'pl-7')}>
        <div className="flex items-center gap-2">
          {depth === 1 && <CornerDownRight className="size-3.5 shrink-0 text-slate-400" aria-hidden />}
          <TaskTypeIcon type={task.type} />
          <TaskKey task={task} />
          <div className="min-w-0 flex-1">
            <InlineText
              value={task.title}
              label={`Rename ${task.title}`}
              onSave={title => onUpdate(task._id, { title })}
              readOnly={!canWrite}
              onOpen={openTask({ task, onOpen, onEdit })}
              className={titleClass}
            />
          </div>
        </div>
        <TaskMeta task={task} showAssignees={false} progress={progress} orphanOf={orphanOf} className={cn(depth === 1 && 'pl-6')} />
      </div>

      <div role="cell" className="flex items-center">
        <AssigneeStack users={task.assignees} />
        {(task.assignees ?? []).length === 0 && <span className="text-xs text-slate-400" aria-label="Unassigned">—</span>}
      </div>

      <div role="cell">
        {canWrite ? (
          <PrioritySelect variant="inline" aria-label={`Priority of ${task.title}`} value={task.priority} onChange={priority => onUpdate(task._id, { priority })} />
        ) : (
          <PriorityIndicator priority={task.priority} className="px-2" />
        )}
      </div>

      <div role="cell">
        {canWrite ? (
          <StatusSelect variant="inline" aria-label={`Status of ${task.title}`} value={task.status} onChange={status => onUpdate(task._id, { status })} />
        ) : (
          <StatusBadge status={task.status} />
        )}
      </div>

      <div role="cell">
        <InlineDate
          label={`Due date for ${task.title}`}
          value={dateKeyOf(task.deadline)}
          min={task.startDate ? dateKeyOf(task.startDate) : undefined}
          onSave={deadline => onUpdate(task._id, { deadline })}
          readOnly={!canWrite}
          className={overdue ? 'font-medium text-red-600' : 'text-slate-500'}
        />
      </div>

      <div role="cell" className="flex items-center justify-end gap-0.5">
        <DetailsButton task={task} onOpen={onOpen} onEdit={onEdit} className={hoverReveal} />
        <TaskActionsMenu
          task={task}
          onEdit={onEdit}
          onDelete={onDelete}
          onOpen={onOpen}
          canEdit={canWrite}
          canDelete={canDelete}
          className={hoverReveal}
        />
      </div>
    </div>
  );
};

/** Counters of comments and attachments, hidden when zero. */
const ActivityCounts = ({ task }: { task: Task }) => {
  const comments = task.comments?.length ?? 0;
  const attachments = task.attachments?.length ?? 0;
  if (!comments && !attachments) return null;

  return (
    <>
      {comments > 0 && (
        <span className="inline-flex shrink-0 items-center gap-1 text-xs text-slate-400" title="Comments">
          <MessageSquare className="size-3" aria-hidden />{comments}<span className="sr-only"> comments</span>
        </span>
      )}
      {attachments > 0 && (
        <span className="inline-flex shrink-0 items-center gap-1 text-xs text-slate-400" title="Attachments">
          <Paperclip className="size-3" aria-hidden />{attachments}<span className="sr-only"> attachments</span>
        </span>
      )}
    </>
  );
};

/** Project, labels, description, counters and assignees under a task title. */
const TaskMeta = ({ task, className, showAssignees = true, progress, orphanOf }: {
  task: Task;
  className?: string;
  showAssignees?: boolean;
  progress?: SubtaskProgressCount;
  orphanOf?: string;
}) => (
  <div className={cn('flex flex-wrap items-center gap-x-2 gap-y-1 mt-0.5', className)}>
    {orphanOf && (
      <span className="inline-flex max-w-40 shrink-0 items-center gap-1 truncate rounded bg-slate-100 px-1.5 text-xs text-slate-600" title={`Subtask of ${orphanOf}`}>
        <CornerDownRight className="size-3 shrink-0" aria-hidden />
        <span className="truncate">Subtask of {orphanOf}</span>
      </span>
    )}
    <StoryPoints points={task.storyPoints} />
    {progress && <SubtaskProgress done={progress.done} total={progress.total} />}
    {task.project && <ProjectChip name={task.project} className="max-w-40 shrink-0" />}
    <LabelList labels={task.labels} />
    {task.description && <p className="min-w-0 flex-1 basis-24 text-xs text-slate-500 line-clamp-1">{task.description}</p>}
    <DependencyCount count={task.dependencies.length} />
    <ActivityCounts task={task} />
    {showAssignees && <AssigneeStack users={task.assignees} className="ml-auto" />}
  </div>
);

/** Compact phone layout: title row with actions, then status, priority and due date. */
const ListCard = ({ task, onUpdate, onEdit, onDelete, onOpen, canWrite, canDelete, depth = 0, orphanOf, progress }: ListRowProps) => {
  const completed = task.status === 'completed';
  const overdue = isOverdue(task.deadline, completed);

  return (
    <li data-testid="list-card" className={cn('group flex items-start gap-3 px-4 py-3', depth === 1 && 'pl-9')}>
      <div className="flex h-10 items-center">
        <Checkbox
          checked={completed}
          disabled={!canWrite}
          onCheckedChange={checked => onUpdate(task._id, { status: checked ? 'completed' : 'pending' })}
          aria-label={completed ? `Mark "${task.title}" as not done` : `Mark "${task.title}" as done`}
        />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-1">
          <div className="flex min-w-0 flex-1 items-center gap-2 pl-2">
            {depth === 1 && <CornerDownRight className="size-3.5 shrink-0 text-slate-400" aria-hidden />}
            <TaskTypeIcon type={task.type} />
            <TaskKey task={task} />
            <div className="min-w-0 flex-1">
              <InlineText
                value={task.title}
                label={`Rename ${task.title}`}
                onSave={title => onUpdate(task._id, { title })}
                readOnly={!canWrite}
                onOpen={openTask({ task, onOpen, onEdit })}
                className={cn('py-2.5 font-medium text-sm text-slate-900', completed && 'text-slate-400 line-through')}
              />
            </div>
          </div>
          <DetailsButton task={task} onOpen={onOpen} onEdit={onEdit} className="shrink-0" />
          <TaskActionsMenu
            task={task}
            onEdit={onEdit}
            onDelete={onDelete}
            onOpen={onOpen}
            canEdit={canWrite}
            canDelete={canDelete}
            className="-mr-2 shrink-0"
          />
        </div>
        <TaskMeta task={task} className="pl-2 -mt-1.5" progress={progress} orphanOf={orphanOf} />

        <div className="mt-2 flex flex-wrap items-center gap-2">
          {canWrite ? (
            <>
              <StatusSelect
                variant="inline"
                aria-label={`Status of ${task.title}`}
                value={task.status}
                onChange={status => onUpdate(task._id, { status })}
                className="h-10 border-slate-200"
              />
              <PrioritySelect
                variant="inline"
                aria-label={`Priority of ${task.title}`}
                value={task.priority}
                onChange={priority => onUpdate(task._id, { priority })}
                className="h-10 border-slate-200"
              />
            </>
          ) : (
            <>
              <StatusBadge status={task.status} />
              <PriorityIndicator priority={task.priority} />
            </>
          )}
          <InlineDate
            label={`Due date for ${task.title}`}
            value={dateKeyOf(task.deadline)}
            min={task.startDate ? dateKeyOf(task.startDate) : undefined}
            onSave={deadline => onUpdate(task._id, { deadline })}
            readOnly={!canWrite}
            className={cn(canWrite && 'h-10 border border-slate-200 px-2.5', overdue ? 'font-medium text-red-600' : 'text-slate-500')}
          />
        </div>
      </div>
    </li>
  );
};

export default ListView;
