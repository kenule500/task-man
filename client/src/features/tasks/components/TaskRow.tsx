import { useState } from 'react';
import { Link2, MoreVertical, Paperclip, Pencil, Trash2 } from 'lucide-react';
import type { Task } from '../types';
import { AssigneeAvatarGroup, DueDateLabel, LabelPill, PriorityBadge, StatusBadge } from './TaskBadges';
import { resolveFileUrl } from '../fileHelpers';

interface TaskRowProps {
  task: Task;
  onToggleComplete: (task: Task) => void;
  onEdit: (task: Task) => void;
  onDelete: (taskId: string) => void;
}

const TaskRow = ({ task, onToggleComplete, onEdit, onDelete }: TaskRowProps) => {
  const [showMenu, setShowMenu] = useState(false);

  return (
    <div className="grid grid-cols-12 gap-4 items-center py-4 px-6 border-b border-slate-100 last:border-0 hover:bg-slate-50/50 transition-colors group">
      <div className="col-span-1 flex items-center">
        <input
          type="checkbox"
          checked={task.status === 'completed'}
          onChange={() => onToggleComplete(task)}
          aria-label={task.status === 'completed' ? 'Mark as pending' : 'Mark as completed'}
          className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary cursor-pointer"
        />
      </div>

      <div className="col-span-4 min-w-0 flex items-center gap-3">
        {task.coverImage && (
          <img
            src={resolveFileUrl(task.coverImage.url)}
            alt=""
            className="w-10 h-10 rounded-lg object-cover flex-shrink-0 border border-slate-100"
          />
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h4 className={`font-medium text-sm line-clamp-1 ${task.status === 'completed' ? 'text-slate-400 line-through' : 'text-slate-900'}`}>
              {task.title}
            </h4>
            {task.dependencies.length > 0 && (
              <span
                title={`Depends on ${task.dependencies.length} task${task.dependencies.length > 1 ? 's' : ''}`}
                className="inline-flex items-center gap-0.5 text-[10px] text-slate-400 flex-shrink-0"
              >
                <Link2 className="w-3 h-3" />{task.dependencies.length}
              </span>
            )}
            {task.attachments.length > 0 && (
              <span
                title={`${task.attachments.length} attachment${task.attachments.length > 1 ? 's' : ''}`}
                className="inline-flex items-center gap-0.5 text-[10px] text-slate-400 flex-shrink-0"
              >
                <Paperclip className="w-3 h-3" />{task.attachments.length}
              </span>
            )}
          </div>
          {task.labels.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1 mt-1">
              {task.labels.slice(0, 3).map(label => <LabelPill key={label} label={label} />)}
            </div>
          ) : task.description ? (
            <p className="text-xs text-slate-400 line-clamp-1 mt-0.5">{task.description}</p>
          ) : null}
        </div>
      </div>

      <div className="col-span-2">
        <PriorityBadge priority={task.priority} />
      </div>

      <div className="col-span-2">
        <StatusBadge status={task.status} />
      </div>

      <div className="col-span-2 flex items-center justify-between gap-2">
        <DueDateLabel deadline={task.deadline} status={task.status} />
        <AssigneeAvatarGroup assignees={task.assignees} />
      </div>

      <div className="col-span-1 flex justify-end relative">
        <button
          onClick={() => setShowMenu(!showMenu)}
          aria-label="Task actions"
          className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-400 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
        >
          <MoreVertical className="w-4 h-4" />
        </button>

        {showMenu && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
            <div className="absolute right-0 top-full mt-1 w-36 bg-white rounded-lg shadow-lg border border-slate-200 py-1 z-20">
              <button
                onClick={() => { onEdit(task); setShowMenu(false); }}
                className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
              >
                <Pencil className="w-3.5 h-3.5" /> Edit
              </button>
              <button
                onClick={() => { onDelete(task._id); setShowMenu(false); }}
                className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default TaskRow;
