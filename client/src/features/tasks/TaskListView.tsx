import { useState } from 'react';
import { ArrowUpDown, CheckSquare, Filter } from 'lucide-react';
import TaskRow from './components/TaskRow';
import type { Task, TaskStatus } from './types';
import { PRIORITY_ORDER } from './types';

interface TaskListViewProps {
  tasks: Task[];
  totalCount: number;
  onToggleComplete: (task: Task) => void;
  onEdit: (task: Task) => void;
  onDelete: (taskId: string) => void;
}

const TaskListView = ({ tasks, totalCount, onToggleComplete, onEdit, onDelete }: TaskListViewProps) => {
  const [statusFilter, setStatusFilter] = useState<'all' | TaskStatus>('all');
  const [sortBy, setSortBy] = useState<'createdAt' | 'deadline' | 'priority'>('createdAt');

  const filteredTasks = tasks
    .filter(task => statusFilter === 'all' || task.status === statusFilter)
    .sort((a, b) => {
      if (sortBy === 'deadline') {
        if (!a.deadline) return 1;
        if (!b.deadline) return -1;
        return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
      }
      if (sortBy === 'priority') return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b border-slate-100 bg-slate-50/50">
        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 h-9">
          <Filter className="w-3.5 h-3.5 text-slate-400" />
          <select
            className="bg-transparent text-sm text-slate-700 outline-none cursor-pointer h-full pr-1"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | TaskStatus)}
          >
            <option value="all">All Status</option>
            <option value="pending">To Do</option>
            <option value="in-progress">In Progress</option>
            <option value="completed">Completed</option>
          </select>
        </div>
        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 h-9">
          <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
          <select
            className="bg-transparent text-sm text-slate-700 outline-none cursor-pointer h-full pr-1"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'createdAt' | 'deadline' | 'priority')}
          >
            <option value="createdAt">Newest</option>
            <option value="deadline">By Due Date</option>
            <option value="priority">By Priority</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4 px-6 py-3 border-b border-slate-100 bg-slate-50/30">
        <div className="col-span-1" />
        <div className="col-span-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Task Name</div>
        <div className="col-span-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">Priority</div>
        <div className="col-span-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</div>
        <div className="col-span-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">Due Date</div>
        <div className="col-span-1" />
      </div>

      {filteredTasks.length === 0 ? (
        <div className="text-center py-20">
          <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-400">
            <CheckSquare className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-semibold text-slate-700 mb-1">No tasks found</h3>
          <p className="text-slate-500 text-sm">
            {totalCount === 0
              ? "You're all caught up! Create your first task to get started."
              : 'No tasks match your current search or filters.'}
          </p>
        </div>
      ) : (
        filteredTasks.map((task) => (
          <TaskRow
            key={task._id}
            task={task}
            onToggleComplete={onToggleComplete}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))
      )}

      {filteredTasks.length > 0 && (
        <div className="flex flex-col sm:flex-row justify-between items-center gap-3 px-6 py-4 bg-slate-50/50 border-t border-slate-100">
          <p className="text-xs text-slate-500">
            Showing <span className="font-medium text-slate-700">{filteredTasks.length}</span> of <span className="font-medium text-slate-700">{totalCount}</span> tasks
          </p>
        </div>
      )}
    </div>
  );
};

export default TaskListView;
