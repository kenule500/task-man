import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Plus } from 'lucide-react';
import type { Task, TaskStatus } from '../types';
import KanbanCard from './KanbanCard';

interface KanbanColumnProps {
  status: TaskStatus;
  label: string;
  tasks: Task[];
  allTasks: Task[];
  onAddTask: (status: TaskStatus) => void;
  onOpen: (task: Task) => void;
  onOpenComments: (task: Task) => void;
  onEdit: (task: Task) => void;
  onDelete: (taskId: string) => void;
}

const DOT_STYLES: Record<TaskStatus, string> = {
  pending: 'bg-slate-400',
  'in-progress': 'bg-blue-500',
  completed: 'bg-emerald-500',
};

const KanbanColumn = ({ status, label, tasks, allTasks, onAddTask, onOpen, onOpenComments, onEdit, onDelete }: KanbanColumnProps) => {
  const { setNodeRef, isOver } = useDroppable({ id: `column:${status}` });
  const ids = tasks.map(t => t._id);

  return (
    <div className="flex flex-col flex-1 min-w-[280px] bg-slate-50 rounded-2xl border border-slate-100">
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${DOT_STYLES[status]}`} />
          <h3 className="text-sm font-semibold text-slate-700">{label}</h3>
          <span className="text-xs text-slate-400 bg-white border border-slate-200 rounded-full px-1.5 py-0.5 min-w-[1.5rem] text-center">
            {tasks.length}
          </span>
        </div>
        <button
          onClick={() => onAddTask(status)}
          aria-label={`Add task to ${label}`}
          className="p-1 rounded-md hover:bg-white text-slate-400 hover:text-slate-600"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      <div
        ref={setNodeRef}
        className={`flex-1 p-3 space-y-3 min-h-[160px] overflow-y-auto transition-colors rounded-b-2xl ${isOver ? 'bg-primary/5' : ''}`}
      >
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {tasks.map(task => (
            <KanbanCard
              key={task._id}
              task={task}
              allTasks={allTasks}
              onOpen={onOpen}
              onOpenComments={onOpenComments}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </SortableContext>

        {tasks.length === 0 ? (
          <button
            onClick={() => onAddTask(status)}
            className="w-full h-16 rounded-xl border border-dashed border-slate-200 text-xs text-slate-400 hover:text-slate-600 hover:border-slate-300 transition-colors"
          >
            Drop a task here or click + to add one
          </button>
        ) : (
          <button
            onClick={() => onAddTask(status)}
            className="w-full h-10 rounded-xl border border-dashed border-slate-200 text-xs font-medium text-slate-400 hover:text-slate-600 hover:border-slate-300 hover:bg-white transition-colors flex items-center justify-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" /> Add task
          </button>
        )}
      </div>
    </div>
  );
};

export default KanbanColumn;
