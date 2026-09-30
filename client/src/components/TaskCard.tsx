import { Calendar, MoreVertical, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';

export interface ITask {
  _id: string;
  title: string;
  description?: string;
  deadline: string;
  status: 'pending' | 'in-progress' | 'completed';
  priority?: 'low' | 'medium' | 'high';
}

interface TaskRowProps {
  task: ITask;
  onEdit: (task: ITask) => void;
  onDelete: (id: string) => void;
}

const TaskRow = ({ task, onEdit, onDelete }: TaskRowProps) => {
  const [showMenu, setShowMenu] = useState(false);

  const statusStyles = {
    'pending': 'bg-slate-100 text-slate-700 border-slate-200',
    'in-progress': 'bg-blue-50 text-blue-700 border-blue-100',
    'completed': 'bg-emerald-50 text-emerald-700 border-emerald-100',
  };

  const priorityStyles = {
    'high': 'text-red-600 font-medium',
    'medium': 'text-amber-600 font-medium',
    'low': 'text-emerald-600 font-medium',
  };

  const formatStatus = (status: string) => {
    if (status === 'in-progress') return 'In Progress';
    if (status === 'completed') return 'Completed';
    return 'To Do';
  };

  return (
    <div className="grid grid-cols-12 gap-4 items-center py-4 px-6 border-b border-slate-100 last:border-0 hover:bg-slate-50/50 transition-colors group">
      {/* Checkbox */}
      <div className="col-span-1 flex items-center">
        <input 
          type="checkbox" 
          className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary cursor-pointer"
        />
      </div>

      {/* Task Name */}
      <div className="col-span-4">
        <h4 className="font-medium text-slate-900 text-sm line-clamp-1">{task.title}</h4>
        {task.description && (
          <p className="text-xs text-slate-400 line-clamp-1 mt-0.5">{task.description}</p>
        )}
      </div>

      {/* Priority */}
      <div className="col-span-2">
        <span className={`text-xs ${priorityStyles[task.priority || 'medium']}`}>
          {(task.priority || 'medium').charAt(0).toUpperCase() + (task.priority || 'medium').slice(1)}
        </span>
      </div>

      {/* Status */}
      <div className="col-span-2">
        <span className={`px-2.5 py-1 rounded-md text-xs font-medium border ${statusStyles[task.status]}`}>
          {formatStatus(task.status)}
        </span>
      </div>

      {/* Due Date */}
      <div className="col-span-2 flex items-center gap-1 text-xs text-slate-500">
        <Calendar className="w-3 h-3" />
        {new Date(task.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
      </div>

      {/* Options Menu */}
      <div className="col-span-1 flex justify-end relative">
        <button 
          onClick={() => setShowMenu(!showMenu)} 
          className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <MoreVertical className="w-4 h-4" />
        </button>
        
        {showMenu && (
          <div className="absolute right-0 top-full mt-1 w-32 bg-white rounded-lg shadow-lg border border-slate-100 py-1 z-10">
            <button 
              onClick={() => { onEdit(task); setShowMenu(false); }}
              className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
            >
              <Pencil className="w-3 h-3" /> Edit
            </button>
            <button 
              onClick={() => { onDelete(task._id); setShowMenu(false); }}
              className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
            >
              <Trash2 className="w-3 h-3" /> Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default TaskRow;