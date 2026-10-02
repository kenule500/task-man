import { useMemo, useState, type DragEvent } from 'react';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { DependencyCount, DueDate, PriorityIndicator, StatusDot } from '../components/TaskBadges';
import TaskActionsMenu from '../components/TaskActionsMenu';
import { PRIORITY_META, STATUS_META, TASK_STATUSES } from '../constants';
import { getDropPosition, groupByStatus, positionBetween } from '../lib/filters';
import type { Task, TaskStatus } from '../types';
import type { TaskViewProps } from './types';

interface DropTarget {
  status: TaskStatus;
  /** Insertion index within the column (as currently rendered) */
  index: number;
}

/** Kanban board: Pending > In Progress > Completed, with drag & drop between and within columns. */
const BoardView = ({ tasks, onUpdate, onEdit, onDelete, onCreate }: TaskViewProps) => {
  const columns = useMemo(() => groupByStatus(tasks), [tasks]);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);

  const resetDrag = () => {
    setDraggingId(null);
    setDropTarget(null);
  };

  const handleDrop = (event: DragEvent, status: TaskStatus) => {
    event.preventDefault();
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

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
      {TASK_STATUSES.map(status => {
        const column = columns[status];
        const isTarget = dropTarget?.status === status;

        return (
          <section
            key={status}
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
              'flex flex-col rounded-2xl border border-slate-100 bg-slate-50/70 transition-colors',
              isTarget && 'border-primary/30 bg-blue-50/40',
            )}
          >
            <header className="flex items-center justify-between px-4 pt-4 pb-3">
              <div className="flex items-center gap-2">
                <StatusDot status={status} />
                <h2 className="text-sm font-semibold text-slate-700">{STATUS_META[status].label}</h2>
                <span className="rounded-md bg-white border border-slate-200 px-1.5 text-xs font-medium tabular-nums text-slate-500">
                  {column.length}
                </span>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Add task to ${STATUS_META[status].label}`}
                onClick={() => onCreate({ status })}
                className="text-slate-400 hover:bg-slate-200 hover:text-slate-700"
              >
                <Plus />
              </Button>
            </header>

            <ol className="flex min-h-32 flex-col gap-2.5 px-3 pb-3">
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
                    dragging={draggingId === task._id}
                    onDragStart={event => {
                      event.dataTransfer.setData('text/plain', task._id);
                      event.dataTransfer.effectAllowed = 'move';
                      setDraggingId(task._id);
                    }}
                    onDragEnd={resetDrag}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    onMove={handleMove}
                  />
                </li>
              ))}
              {isTarget && dropTarget.index === column.length && <DropIndicator />}
              {column.length === 0 && !isTarget && (
                <li className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-slate-200 py-8 text-xs text-slate-400">
                  Drop tasks here
                </li>
              )}
            </ol>
          </section>
        );
      })}
    </div>
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
  onMove: (task: Task, status: TaskStatus) => void;
}

const BoardCard = ({ task, dragging, onDragStart, onDragEnd, onEdit, onDelete, onMove }: BoardCardProps) => {
  const completed = task.status === 'completed';

  return (
    <article
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={cn(
        'group cursor-grab rounded-xl border border-t-[3px] border-slate-100 bg-white p-3.5 shadow-sm transition-shadow hover:shadow-md active:cursor-grabbing',
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
          onMove={onMove}
          className="-mt-1 -mr-1.5 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-popup-open:opacity-100"
        />
      </div>

      <button
        type="button"
        onClick={() => onEdit(task)}
        className={cn(
          'mt-1 block w-full text-left text-sm font-medium text-slate-900 hover:text-primary focus-visible:outline-2 focus-visible:outline-primary rounded',
          completed && 'text-slate-400 line-through',
        )}
      >
        {task.title}
      </button>
      {task.description && <p className="mt-1 text-xs text-slate-400 line-clamp-2">{task.description}</p>}

      <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5">
        <DueDate deadline={task.deadline} completed={completed} />
        <DependencyCount count={task.dependencies.length} />
      </div>
    </article>
  );
};

export default BoardView;
