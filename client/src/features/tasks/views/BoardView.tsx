import { useId, useMemo, useRef, useState, type DragEvent, type KeyboardEvent } from 'react';
import { MessageSquare, Paperclip, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { DependencyCount, DueDate, PriorityIndicator, StatusDot } from '../components/TaskBadges';
import TaskActionsMenu from '../components/TaskActionsMenu';
import { AssigneeStack, LabelList } from '../components/TaskChips';
import { PRIORITY_META, STATUS_META, TASK_STATUSES } from '../constants';
import { getDropPosition, groupByStatus, positionBetween } from '../lib/filters';
import { closestColumnIndex, scrollBehavior } from '../lib/scroll';
import type { Task, TaskStatus } from '../types';
import type { TaskViewProps } from './types';

interface DropTarget {
  status: TaskStatus;
  /** Insertion index within the column (as currently rendered) */
  index: number;
}

/** Kanban board: Pending > In Progress > Completed, with drag & drop between and within columns. */
const BoardView = ({ tasks, onUpdate, onEdit, onDelete, onCreate, onOpen, canWrite = true, canDelete = true }: TaskViewProps) => {
  const columns = useMemo(() => groupByStatus(tasks), [tasks]);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);

  const resetDrag = () => {
    setDraggingId(null);
    setDropTarget(null);
  };

  const handleDrop = (event: DragEvent, status: TaskStatus) => {
    event.preventDefault();
    if (!canWrite) return;
    const id = event.dataTransfer.getData('text/plain') || draggingId;
    const task = tasks.find(t => t._id === id);
    const index = dropTarget?.status === status ? dropTarget.index : columns[status].length;
    resetDrag();
    if (!task) return;

    const position = getDropPosition(columns[status], task._id, index);
    if (task.status === status && position === null) return;
    void onUpdate(task._id, { status, ...(position !== null && { position }) });
  };

  const handleMove = (task: Task, status: TaskStatus) => {
    const column = columns[status];
    void onUpdate(task._id, { status, position: positionBetween(column[column.length - 1]?.position) });
  };

  // Phone status tabs: tapping scrolls the column in, scrolling updates the active tab.
  const idPrefix = useId();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Partial<Record<TaskStatus, HTMLElement | null>>>({});
  const tabRefs = useRef<Partial<Record<TaskStatus, HTMLButtonElement | null>>>({});
  const programmaticScroll = useRef(false);
  const unlockTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [activeStatus, setActiveStatus] = useState<TaskStatus>(TASK_STATUSES[0]);
  const columnId = (status: TaskStatus) => `${idPrefix}-column-${status}`;

  const selectTab = (status: TaskStatus) => {
    setActiveStatus(status);
    const scroller = scrollerRef.current;
    const section = sectionRefs.current[status];
    if (!scroller || !section) return;
    const behavior = scrollBehavior();
    if (behavior === 'smooth') {
      // ignore scroll events while the smooth scroll runs, so the tab does not flicker
      programmaticScroll.current = true;
      clearTimeout(unlockTimer.current);
      unlockTimer.current = setTimeout(() => { programmaticScroll.current = false; }, 700);
    }
    const delta = section.getBoundingClientRect().left - scroller.getBoundingClientRect().left;
    scroller.scrollTo?.({ left: scroller.scrollLeft + delta, behavior });
  };

  const handleScroll = () => {
    if (programmaticScroll.current) return;
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const lefts = TASK_STATUSES.map(status => sectionRefs.current[status]?.getBoundingClientRect().left ?? Infinity);
    const next = TASK_STATUSES[closestColumnIndex(lefts, scroller.getBoundingClientRect().left)];
    if (next !== activeStatus) setActiveStatus(next);
  };

  const handleTabKeyDown = (event: KeyboardEvent, status: TaskStatus) => {
    const index = TASK_STATUSES.indexOf(status);
    const target =
      event.key === 'ArrowRight' ? TASK_STATUSES[(index + 1) % TASK_STATUSES.length]
        : event.key === 'ArrowLeft' ? TASK_STATUSES[(index + TASK_STATUSES.length - 1) % TASK_STATUSES.length]
          : event.key === 'Home' ? TASK_STATUSES[0]
            : event.key === 'End' ? TASK_STATUSES[TASK_STATUSES.length - 1]
              : null;
    if (!target) return;
    event.preventDefault();
    selectTab(target);
    tabRefs.current[target]?.focus();
  };

  return (
    <>
    {/* Phones and tablets: sticky status tabs (the columns scroll sideways below lg) */}
    <div
      role="tablist"
      aria-label="Task status"
      data-testid="board-tabs"
      className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-10 -mx-1 mb-3 flex gap-1 rounded-xl border border-slate-200 bg-white/95 p-1 shadow-sm backdrop-blur lg:hidden"
    >
      {TASK_STATUSES.map(status => {
        const active = status === activeStatus;
        return (
          <button
            key={status}
            ref={node => { tabRefs.current[status] = node; }}
            type="button"
            role="tab"
            id={`${idPrefix}-tab-${status}`}
            aria-selected={active}
            aria-controls={columnId(status)}
            tabIndex={active ? 0 : -1}
            onClick={() => selectTab(status)}
            onKeyDown={event => handleTabKeyDown(event, status)}
            className={cn(
              'flex min-h-11 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-semibold transition-colors',
              'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary active:scale-[0.98]',
              active ? 'bg-primary text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100',
            )}
          >
            <span className="truncate">{STATUS_META[status].label}</span>
            <span
              className={cn(
                'rounded-md px-1.5 text-[11px] font-medium tabular-nums',
                active ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500',
              )}
            >
              {columns[status].length}
              <span className="sr-only"> tasks</span>
            </span>
          </button>
        );
      })}
    </div>

    <div
      ref={scrollerRef}
      data-testid="board-columns"
      onScroll={handleScroll}
      className="-mx-1 flex snap-x snap-mandatory items-start gap-3 overflow-x-auto px-1 pb-3 md:gap-4 lg:mx-0 lg:grid lg:snap-none lg:grid-cols-3 lg:gap-5 lg:overflow-visible lg:px-0 lg:pb-0"
    >
      {TASK_STATUSES.map(status => {
        const column = columns[status];
        const isTarget = dropTarget?.status === status;

        return (
          <section
            key={status}
            id={columnId(status)}
            ref={node => { sectionRefs.current[status] = node; }}
            aria-label={`${STATUS_META[status].label} column`}
            onDragOver={event => {
              event.preventDefault();
              if (!isTarget || dropTarget.index !== column.length) setDropTarget({ status, index: column.length });
            }}
            onDragLeave={event => {
              if (!event.currentTarget.contains(event.relatedTarget as Node)) setDropTarget(null);
            }}
            onDrop={event => handleDrop(event, status)}
            className={cn(
              'flex w-[85vw] max-w-sm shrink-0 snap-start flex-col rounded-2xl border border-slate-100 bg-slate-50/70 transition-colors lg:w-auto lg:max-w-none lg:shrink',
              isTarget && 'border-primary/30 bg-blue-50/40',
            )}
          >
            <header className="flex items-center justify-between px-3 pt-1 pb-1 md:px-4 md:pt-4 md:pb-3">
              <div className="flex items-center gap-2">
                <StatusDot status={status} />
                <h2 className="text-sm font-semibold text-slate-700">{STATUS_META[status].label}</h2>
                <span className="rounded-md bg-white border border-slate-200 px-1.5 text-xs font-medium tabular-nums text-slate-500">
                  {column.length}
                </span>
              </div>
              {canWrite && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Add task to ${STATUS_META[status].label}`}
                  onClick={() => onCreate({ status })}
                  className="size-11 text-slate-400 hover:bg-slate-200 hover:text-slate-700 md:size-7"
                >
                  <Plus />
                </Button>
              )}
            </header>

            <ol className="flex min-h-32 flex-col gap-2 px-2.5 pb-3 md:gap-2.5 md:px-3">
              {column.map((task, index) => (
                <li
                  key={task._id}
                  onDragOver={event => {
                    event.preventDefault();
                    event.stopPropagation();
                    const { top, height } = event.currentTarget.getBoundingClientRect();
                    const nextIndex = event.clientY > top + height / 2 ? index + 1 : index;
                    if (!isTarget || dropTarget.index !== nextIndex) setDropTarget({ status, index: nextIndex });
                  }}
                >
                  {isTarget && dropTarget.index === index && <DropIndicator />}
                  <BoardCard
                    task={task}
                    canWrite={canWrite}
                    canDelete={canDelete}
                    dragging={draggingId === task._id}
                    onDragStart={event => {
                      event.dataTransfer.setData('text/plain', task._id);
                      event.dataTransfer.effectAllowed = 'move';
                      setDraggingId(task._id);
                    }}
                    onDragEnd={resetDrag}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    onOpen={onOpen}
                    onMove={handleMove}
                  />
                </li>
              ))}
              {isTarget && dropTarget.index === column.length && <DropIndicator />}
              {column.length === 0 && !isTarget && (
                <li className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-slate-200 py-8 text-xs text-slate-400">
                  {canWrite ? 'Drop tasks here' : 'No tasks'}
                </li>
              )}
            </ol>
          </section>
        );
      })}
    </div>
    </>
  );
};

const DropIndicator = () => <div aria-hidden className="my-1 h-0.5 rounded-full bg-primary" />;

interface BoardCardProps {
  task: Task;
  dragging: boolean;
  onDragStart: (event: DragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
  onOpen?: (task: Task) => void;
  onMove: (task: Task, status: TaskStatus) => void;
  canWrite: boolean;
  canDelete: boolean;
}

const BoardCard = ({ task, dragging, onDragStart, onDragEnd, onEdit, onDelete, onOpen, onMove, canWrite, canDelete }: BoardCardProps) => {
  const completed = task.status === 'completed';

  return (
    <article
      draggable={canWrite}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={cn(
        'group rounded-xl border border-t-[3px] border-slate-100 bg-white p-3 shadow-sm transition-shadow md:p-3.5 hover:shadow-md',
        canWrite && 'cursor-grab active:cursor-grabbing',
        PRIORITY_META[task.priority].accent,
        dragging && 'opacity-40',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <PriorityIndicator priority={task.priority} />
        <TaskActionsMenu
          task={task}
          onEdit={onEdit}
          onDelete={onDelete}
          onOpen={onOpen}
          onMove={onMove}
          canEdit={canWrite}
          canDelete={canDelete}
          className="-mt-3 -mr-3.5 size-11 md:-mt-1 md:-mr-1.5 md:size-7 md:opacity-0 md:group-hover:opacity-100 focus-visible:opacity-100 data-popup-open:opacity-100"
        />
      </div>

      <button
        type="button"
        onClick={() => (onOpen ?? onEdit)(task)}
        className={cn(
          'mt-1 block w-full text-left text-sm font-medium text-slate-900 hover:text-primary focus-visible:outline-2 focus-visible:outline-primary rounded',
          completed && 'text-slate-400 line-through',
        )}
      >
        {task.title}
      </button>
      {task.project && (
        <span className="mt-1.5 inline-block max-w-full truncate text-xs text-slate-500 bg-slate-100 rounded px-1.5" title="Project">
          {task.project}
        </span>
      )}
      <LabelList labels={task.labels} max={4} className="mt-2" />
      {task.description && <p className="mt-1 text-xs text-slate-400 line-clamp-2">{task.description}</p>}

      <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-slate-100 pt-2 md:mt-3 md:pt-2.5">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <DueDate deadline={task.deadline} completed={completed} />
          <DependencyCount count={task.dependencies.length} />
          {(task.comments?.length ?? 0) > 0 && (
            <span className="inline-flex items-center gap-1 text-xs text-slate-400" title="Comments">
              <MessageSquare className="size-3" aria-hidden />{task.comments?.length}<span className="sr-only"> comments</span>
            </span>
          )}
          {(task.attachments?.length ?? 0) > 0 && (
            <span className="inline-flex items-center gap-1 text-xs text-slate-400" title="Attachments">
              <Paperclip className="size-3" aria-hidden />{task.attachments?.length}<span className="sr-only"> attachments</span>
            </span>
          )}
        </div>
        <AssigneeStack users={task.assignees} />
      </div>
    </article>
  );
};

export default BoardView;
