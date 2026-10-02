import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';
import EmptyState from '../components/EmptyState';
import { DependencyCount } from '../components/TaskBadges';
import { InlineDate, InlineText } from '../components/InlineEdit';
import TaskActionsMenu from '../components/TaskActionsMenu';
import { PrioritySelect, StatusSelect } from '../components/TaskSelects';
import { dateKeyOf, isOverdue } from '../lib/date';
import type { Task } from '../types';
import type { TaskViewProps } from './types';

const GRID = 'grid grid-cols-[2.5rem_minmax(0,1fr)_7.5rem_9.5rem_9.5rem_2.5rem] items-center gap-4';

interface ListViewProps extends TaskViewProps {
  /** Total before filtering, to tell "no tasks" apart from "no matches". */
  totalCount: number;
}

/** Dense table for scanning, with every field editable in place. */
const ListView = ({ tasks, totalCount, onUpdate, onEdit, onDelete }: ListViewProps) => (
  <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
    <div className="overflow-x-auto">
      <div role="table" aria-label="Tasks" className="min-w-[760px]">
        <div role="row" className={cn(GRID, 'px-6 py-4 border-b border-slate-100 bg-slate-50/50')}>
          {['Done', 'Task Name', 'Priority', 'Status', 'Due Date'].map((header, i) => (
            <div key={header} role="columnheader" className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              <span className={cn(i === 0 && 'sr-only')}>{header}</span>
            </div>
          ))}
          <div role="columnheader"><span className="sr-only">Actions</span></div>
        </div>

        {tasks.length === 0 ? (
          <EmptyState
            title="No tasks found"
            description={totalCount === 0
              ? "You're all caught up! Create your first task to get started."
              : 'No tasks match your current filters.'}
          />
        ) : (
          tasks.map(task => (
            <ListRow key={task._id} task={task} onUpdate={onUpdate} onEdit={onEdit} onDelete={onDelete} />
          ))
        )}
      </div>
    </div>

    {tasks.length > 0 && (
      <div className="flex justify-between items-center px-6 py-4 bg-slate-50/50 border-t border-slate-100">
        <p className="text-xs text-slate-500">
          Showing <span className="font-medium text-slate-700">{tasks.length}</span> of{' '}
          <span className="font-medium text-slate-700">{totalCount}</span> tasks
        </p>
      </div>
    )}
  </div>
);

type ListRowProps = Pick<TaskViewProps, 'onUpdate' | 'onEdit' | 'onDelete'> & { task: Task };

const ListRow = ({ task, onUpdate, onEdit, onDelete }: ListRowProps) => {
  const completed = task.status === 'completed';
  const overdue = isOverdue(task.deadline, completed);

  return (
    <div role="row" className={cn(GRID, 'py-3 px-6 border-b border-slate-100 last:border-0 hover:bg-slate-50/50 transition-colors group')}>
      <div role="cell" className="flex items-center">
        <Checkbox
          checked={completed}
          onCheckedChange={checked => onUpdate(task._id, { status: checked ? 'completed' : 'pending' })}
          aria-label={completed ? `Mark "${task.title}" as not done` : `Mark "${task.title}" as done`}
        />
      </div>

      <div role="cell" className="min-w-0 pl-2">
        <InlineText
          value={task.title}
          label={`Rename ${task.title}`}
          onSave={title => onUpdate(task._id, { title })}
          className={cn('font-medium text-sm text-slate-900', completed && 'text-slate-400 line-through')}
        />
        <div className="flex items-center gap-2 mt-0.5">
          {task.description && <p className="text-xs text-slate-400 line-clamp-1">{task.description}</p>}
          <DependencyCount count={task.dependencies.length} />
        </div>
      </div>

      <div role="cell">
        <PrioritySelect variant="inline" aria-label={`Priority of ${task.title}`} value={task.priority} onChange={priority => onUpdate(task._id, { priority })} />
      </div>

      <div role="cell">
        <StatusSelect variant="inline" aria-label={`Status of ${task.title}`} value={task.status} onChange={status => onUpdate(task._id, { status })} />
      </div>

      <div role="cell">
        <InlineDate
          label={`Due date for ${task.title}`}
          value={dateKeyOf(task.deadline)}
          min={task.startDate ? dateKeyOf(task.startDate) : undefined}
          onSave={deadline => onUpdate(task._id, { deadline })}
          className={overdue ? 'font-medium text-red-600' : 'text-slate-500'}
        />
      </div>

      <div role="cell" className="flex justify-end">
        <TaskActionsMenu
          task={task}
          onEdit={onEdit}
          onDelete={onDelete}
          className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-popup-open:opacity-100"
        />
      </div>
    </div>
  );
};

export default ListView;
