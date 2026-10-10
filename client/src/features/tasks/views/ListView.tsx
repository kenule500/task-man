import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckSquare, Circle, CircleCheck, CornerDownRight, MessageSquare, PanelRightOpen, Paperclip } from 'lucide-react';
import { cn } from '@/lib/utils';
// Deep import: the projects index imports the tasks module back
import ProjectChip from '@/features/projects/components/ProjectChip';
import type { Project } from '@/features/projects';
import ConfirmActionDialog from '@/components/ConfirmActionDialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { EmptyState, toast } from '@/components/ds';
import { getApiErrorMessage, type BulkTaskPatch } from '../api';
import BulkActionBar from '../components/BulkActionBar';
import {
  ChecklistBadge, DependencyCount, PriorityIndicator, RepeatBadge, StatusBadge, StoryPoints, SubtaskProgress, TaskTypeIcon,
} from '../components/TaskBadges';
import { InlineDate, InlineText } from '../components/InlineEdit';
import TaskActionsMenu from '../components/TaskActionsMenu';
import TaskKey from '../components/TaskKey';
import { AssigneeStack, LabelList } from '../components/TaskChips';
import { PrioritySelect, StatusSelect } from '../components/TaskSelects';
import { dateKeyOf, isOverdue } from '../lib/date';
import { pruneSelection, selectRange, selectionState, toggleAll } from '../lib/selection';
import { arrangeWithSubtasks, countSubtasks, indexSubtasks, type ListEntry, type SubtaskProgressCount } from '../lib/subtasks';
import type { Task } from '../types';
import type { TaskViewProps } from './types';

const GRID = 'grid grid-cols-[2.5rem_minmax(0,1fr)_6rem_7.5rem_9.5rem_9.5rem_4.5rem] items-center gap-4';
// Same columns with a leading one for the selection checkbox
const GRID_SELECTABLE = 'grid grid-cols-[2.5rem_2.5rem_minmax(0,1fr)_6rem_7.5rem_9.5rem_9.5rem_4.5rem] items-center gap-4';

/** Draws a dash instead of a tick while indeterminate (the shared Checkbox only knows the tick). */
const INDETERMINATE = 'data-indeterminate:border-primary data-indeterminate:bg-primary data-indeterminate:[&_svg]:hidden data-indeterminate:before:block data-indeterminate:before:h-0.5 data-indeterminate:before:w-2 data-indeterminate:before:rounded-full data-indeterminate:before:bg-primary-foreground';

interface ListViewProps extends TaskViewProps {
  /** Total before filtering, to tell "no tasks" apart from "no matches". */
  totalCount: number;
  /** Every task, so subtask progress and parent titles stay right while filters hide some rows. Defaults to `tasks`. */
  allTasks?: Task[];
  /**
   * Applies a change to the selected tasks. Should reject on failure (the message is toasted).
   * Without it (and without `onBulkDelete`) the selection checkboxes are hidden.
   */
  onBulkUpdate?: (ids: string[], patch: BulkTaskPatch) => Promise<unknown> | void;
  /** Deletes the selected tasks with their subtasks. Should reject on failure. Needs `canDelete`. */
  onBulkDelete?: (ids: string[]) => Promise<unknown> | void;
  /** Projects with their sprints, for the bulk "Sprint" action. */
  projects?: Project[];
  /** Workspace members, for the bulk "Assignee" action (hidden when empty). */
  members?: { _id: string; name: string }[];
}

/** Dense table (from `md`) or compact cards (phones), with every field editable in place. */
const ListView = ({
  tasks, totalCount, allTasks, onUpdate, onEdit, onDelete, onOpen, canWrite = true, canDelete = true,
  onBulkUpdate, onBulkDelete, projects, members,
}: ListViewProps) => {
  const entries = useMemo(() => arrangeWithSubtasks(tasks, allTasks ?? tasks), [tasks, allTasks]);
  const children = useMemo(() => indexSubtasks(allTasks ?? tasks), [tasks, allTasks]);
  const visibleIds = useMemo(() => entries.map(entry => entry.task._id), [entries]);

  const canBulkEdit = Boolean(onBulkUpdate) && canWrite;
  const canBulkDelete = Boolean(onBulkDelete) && canDelete;
  const selectable = canBulkEdit || canBulkDelete;

  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // Phones show selection checkboxes only after tapping "Select" (or while something is selected)
  const [phoneSelecting, setPhoneSelecting] = useState(false);
  const anchor = useRef<string | null>(null);
  const shiftHeld = useRef(false);

  // Rows that filters or deletes removed from the list leave the selection
  const [seenIds, setSeenIds] = useState(visibleIds);
  if (seenIds !== visibleIds) {
    setSeenIds(visibleIds);
    setSelected(pruneSelection(selected, visibleIds));
  }

  const count = selected.size;
  const clear = useCallback(() => {
    setSelected(new Set());
    anchor.current = null;
  }, []);

  // Esc clears the selection (unless it is closing a menu or dialog)
  useEffect(() => {
    if (count === 0) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if ((event.target as Element | null)?.closest?.('[role="menu"],[role="dialog"],[role="alertdialog"],[role="listbox"]')) return;
      clear();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [count, clear]);

  const select = (id: string, checked: boolean) => {
    const range = shiftHeld.current && anchor.current !== null;
    const from = anchor.current;
    shiftHeld.current = false;
    setSelected(current => {
      if (range) return selectRange(visibleIds, current, from, id, checked);
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
    anchor.current = id;
  };

  const run = async (action: () => Promise<unknown> | void, failure: string): Promise<boolean> => {
    setBusy(true);
    try {
      await action();
      return true;
    } catch (error) {
      toast.error(getApiErrorMessage(error, failure));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const applyPatch = (patch: BulkTaskPatch) => {
    if (onBulkUpdate) void run(() => onBulkUpdate([...selected], patch), 'Could not update the selected tasks.');
  };

  const confirmDelete = async () => {
    if (!onBulkDelete) return;
    const ok = await run(() => onBulkDelete([...selected]), 'Could not delete the selected tasks.');
    setConfirmingDelete(false);
    if (ok) clear();
  };

  const rowProps = { onUpdate, onEdit, onDelete, onOpen, canWrite, canDelete };
  const entryProps = (entry: ListEntry) => ({
    task: entry.task,
    depth: entry.depth,
    orphanOf: entry.orphanOf,
    progress: countSubtasks(children.get(entry.task._id) ?? []),
    selection: selectable ? { selected: selected.has(entry.task._id), active: count > 0 || phoneSelecting, onChange: select } : undefined,
    ...rowProps,
  });

  const state = selectionState(visibleIds, selected);
  const selectAll = (
    <Checkbox
      checked={state === 'all'}
      indeterminate={state === 'some'}
      onCheckedChange={() => {
        setSelected(toggleAll(visibleIds, selected));
        anchor.current = null;
      }}
      aria-label="Select all tasks"
      className={INDETERMINATE}
    />
  );
  const orphanedSubtasks = (allTasks ?? tasks)
    .filter(task => task.parent && selected.has(task.parent) && !selected.has(task._id)).length;
  const noun = count === 1 ? 'task' : 'tasks';

  return (
    // The checkbox change event carries no modifier keys, so Shift is noted on the click that causes it
    <div
      className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden"
      onClickCapture={event => { shiftHeld.current = event.shiftKey; }}
    >
      {selectable && (
        <p role="status" aria-live="polite" aria-atomic className="sr-only">
          {count > 0 ? `${count} ${noun} selected` : ''}
        </p>
      )}
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
            <div role="table" aria-label="Tasks" className={selectable ? 'min-w-[900px]' : 'min-w-[860px]'}>
              <div role="row" className={cn(selectable ? GRID_SELECTABLE : GRID, 'px-6 py-4 border-b border-slate-100 bg-slate-50/50')}>
                {selectable && <div role="columnheader" className="flex items-center">{selectAll}</div>}
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
          {selectable && (
            <div className="flex items-center gap-3 border-b border-slate-100 bg-slate-50/50 px-4 py-1 md:hidden">
              {count > 0 || phoneSelecting ? (
                <>
                  <div className="flex h-10 items-center">{selectAll}</div>
                  <span className="flex-1 text-sm text-slate-600" aria-hidden>Select all</span>
                  <button
                    type="button"
                    onClick={() => { setPhoneSelecting(false); clear(); }}
                    className="min-h-10 rounded-md px-2 text-sm font-medium text-primary-hover focus-visible:outline-2 focus-visible:outline-primary"
                  >
                    Done
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setPhoneSelecting(true)}
                  className="ml-auto min-h-10 rounded-md px-2 text-sm font-medium text-primary-hover focus-visible:outline-2 focus-visible:outline-primary"
                >
                  Select
                </button>
              )}
            </div>
          )}
          <ul role="list" aria-label="Tasks" data-testid="list-cards" className="divide-y divide-slate-100 md:hidden">
            {entries.map(entry => (
              <ListCard key={entry.task._id} {...entryProps(entry)} />
            ))}
          </ul>

          {/* Leaves room for the floating bulk bar so it never covers the last rows */}
          <div className={cn('flex justify-between items-center px-4 py-4 bg-slate-50/50 border-t border-slate-100 md:px-6', count > 0 && 'pb-28 md:pb-20')}>
            <p className="text-xs text-slate-500">
              Showing <span className="font-medium text-slate-700">{tasks.length}</span> of{' '}
              <span className="font-medium text-slate-700">{totalCount}</span> tasks
            </p>
          </div>
        </>
      )}

      {selectable && count > 0 && (
        <BulkActionBar
          count={count}
          busy={busy}
          onApply={canBulkEdit ? applyPatch : undefined}
          onDelete={canBulkDelete ? () => setConfirmingDelete(true) : undefined}
          onClear={clear}
          members={members}
          projects={projects}
          labelSuggestions={labelsOf(allTasks ?? tasks)}
        />
      )}
      <ConfirmActionDialog
        open={confirmingDelete}
        onOpenChange={open => !open && !busy && setConfirmingDelete(false)}
        title={`Delete ${count} ${noun}?`}
        description={
          <>
            {orphanedSubtasks > 0 && `${orphanedSubtasks} ${orphanedSubtasks === 1 ? 'subtask goes' : 'subtasks go'} with them. `}
            The selected tasks are deleted with their comments and attachments. This cannot be undone.
          </>
        }
        confirmLabel={`Delete ${count} ${noun}`}
        busyLabel="Deleting..."
        busy={busy}
        onConfirm={() => { void confirmDelete(); }}
      />
    </div>
  );
};

/** Labels used on any task, most common first, offered as suggestions in the bulk "Labels" dialog. */
const labelsOf = (tasks: Task[]): string[] => {
  const counts = new Map<string, number>();
  for (const task of tasks) for (const label of task.labels ?? []) counts.set(label, (counts.get(label) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([label]) => label);
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
  /** Selection checkbox of the row; omitted when bulk edit is unavailable. */
  /** `active`: some row is selected or the phone select mode is on, so every checkbox stays visible. */
  selection?: { selected: boolean; active: boolean; onChange: (id: string, checked: boolean) => void };
};

/** Opens the details dialog (falls back to the edit form when the page has none). */
const openTask = ({ task, onOpen, onEdit }: Pick<ListRowProps, 'task' | 'onOpen' | 'onEdit'>) => () => (onOpen ?? onEdit)(task);

const DetailsButton = ({ task, onOpen, onEdit, className }: Pick<ListRowProps, 'task' | 'onOpen' | 'onEdit'> & { className?: string }) => (
  <Button
    variant="ghost"
    size="icon-sm"
    aria-label={`Open details for ${task.title}`}
    onClick={openTask({ task, onOpen, onEdit })}
    className={cn('size-10 text-slate-500 hover:bg-slate-200 hover:text-slate-600 md:size-7', className)}
  >
    <PanelRightOpen />
  </Button>
);

/** Round "done" button, visually distinct from the square selection checkbox. */
const DoneToggle = ({ task, completed, canWrite, onUpdate }: { task: Task; completed: boolean; canWrite: boolean; onUpdate: ListRowProps['onUpdate'] }) => (
  <button
    type="button"
    aria-pressed={completed}
    disabled={!canWrite}
    onClick={() => onUpdate(task._id, { status: completed ? 'pending' : 'completed' })}
    aria-label={completed ? `Mark "${task.title}" as not done` : `Mark "${task.title}" as done`}
    className={cn(
      'flex size-10 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors md:size-8',
      'hover:text-emerald-700 focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-default disabled:hover:text-slate-400',
      completed && 'text-emerald-600',
    )}
  >
    {completed ? <CircleCheck className="size-5" aria-hidden /> : <Circle className="size-5" aria-hidden />}
  </button>
);

const SelectCheckbox = ({ task, selection }: Pick<ListRowProps, 'task'> & { selection: NonNullable<ListRowProps['selection']> }) => (
  <Checkbox
    checked={selection.selected}
    onCheckedChange={checked => selection.onChange(task._id, checked)}
    aria-label={`Select "${task.title}"`}
  />
);

const ListRow = ({ task, onUpdate, onEdit, onDelete, onOpen, canWrite, canDelete, depth = 0, orphanOf, progress, selection }: ListRowProps) => {
  const completed = task.status === 'completed';
  const overdue = isOverdue(task.deadline, completed);
  const titleClass = cn('font-medium text-sm text-slate-900', completed && 'text-slate-500 line-through');
  const hoverReveal = 'md:opacity-0 md:group-hover:opacity-100 focus-visible:opacity-100 data-popup-open:opacity-100';

  return (
    <div
      role="row"
      aria-selected={selection ? selection.selected : undefined}
      className={cn(
        selection ? GRID_SELECTABLE : GRID,
        'py-3 px-6 border-b border-slate-100 last:border-0 hover:bg-slate-50/50 transition-colors group',
        selection?.selected && 'bg-primary/5 hover:bg-primary/5',
      )}
    >
      {selection && (
        <div role="cell" className={cn('flex items-center transition-opacity', !selection.active && 'opacity-0 group-hover:opacity-100 focus-within:opacity-100')}>
          <SelectCheckbox task={task} selection={selection} />
        </div>
      )}
      <div role="cell" className="flex items-center">
        <DoneToggle task={task} completed={completed} canWrite={canWrite} onUpdate={onUpdate} />
      </div>

      <div role="cell" className={cn('min-w-0 pl-2', depth === 1 && 'pl-7')}>
        <div className="flex items-center gap-2">
          {depth === 1 && <CornerDownRight className="size-3.5 shrink-0 text-slate-500" aria-hidden />}
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
        {(task.assignees ?? []).length === 0 && <span className="text-xs text-slate-500" aria-label="Unassigned">—</span>}
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
          subtaskCount={progress?.total}
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
        <span className="inline-flex shrink-0 items-center gap-1 text-xs text-slate-500" title="Comments">
          <MessageSquare className="size-3" aria-hidden />{comments}<span className="sr-only"> comments</span>
        </span>
      )}
      {attachments > 0 && (
        <span className="inline-flex shrink-0 items-center gap-1 text-xs text-slate-500" title="Attachments">
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
    <ChecklistBadge items={task.checklist} />
    <RepeatBadge recurrence={task.recurrence} />
    <ActivityCounts task={task} />
    {showAssignees && <AssigneeStack users={task.assignees} className="ml-auto" />}
  </div>
);

/** Compact phone layout: title row with actions, then status, priority and due date. */
const ListCard = ({ task, onUpdate, onEdit, onDelete, onOpen, canWrite, canDelete, depth = 0, orphanOf, progress, selection }: ListRowProps) => {
  const completed = task.status === 'completed';
  const overdue = isOverdue(task.deadline, completed);

  return (
    <li
      data-testid="list-card"
      // The checkbox announces selection; list items cannot carry aria-selected
      data-selected={selection?.selected ? "" : undefined}
      className={cn('group flex items-start gap-3 px-4 py-3', depth === 1 && 'pl-9', selection?.selected && 'bg-primary/5')}
    >
      {selection?.active && (
        <div className="flex h-10 items-center">
          <SelectCheckbox task={task} selection={selection} />
        </div>
      )}
      <div className="flex h-10 items-center">
        <DoneToggle task={task} completed={completed} canWrite={canWrite} onUpdate={onUpdate} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-1">
          <div className="flex min-w-0 flex-1 items-center gap-2 pl-2">
            {depth === 1 && <CornerDownRight className="size-3.5 shrink-0 text-slate-500" aria-hidden />}
            <TaskTypeIcon type={task.type} />
            <TaskKey task={task} />
            <div className="min-w-0 flex-1">
              <InlineText
                value={task.title}
                label={`Rename ${task.title}`}
                onSave={title => onUpdate(task._id, { title })}
                readOnly={!canWrite}
                onOpen={openTask({ task, onOpen, onEdit })}
                className={cn('!whitespace-normal !overflow-visible break-words py-2 font-medium text-sm text-slate-900', completed && 'text-slate-500 line-through')}
              />
            </div>
          </div>
          <TaskActionsMenu
            task={task}
            onEdit={onEdit}
            onDelete={onDelete}
            onOpen={onOpen}
            canEdit={canWrite}
            canDelete={canDelete}
            subtaskCount={progress?.total}
            className="-mr-2 shrink-0"
          />
        </div>
        <TaskMeta task={task} className="pl-2" progress={progress} orphanOf={orphanOf} />

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
