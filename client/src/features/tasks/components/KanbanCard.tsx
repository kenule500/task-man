import { useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Clock, Lock, Link2, MessageSquare, MoreVertical, Paperclip, Pencil, Trash2 } from 'lucide-react';
import type { Task } from '../types';
import { blockingDependencies, getTaskUrgency, isTaskBlocked } from '../types';
import { AssigneeAvatarGroup } from './TaskBadges';
import { resolveFileUrl } from '../fileHelpers';

interface KanbanCardProps {
  task: Task;
  allTasks: Task[];
  onOpen: (task: Task) => void;
  onOpenComments: (task: Task) => void;
  onEdit: (task: Task) => void;
  onDelete: (taskId: string) => void;
}

const URGENCY_COLOR: Record<string, string> = {
  green: 'text-emerald-600',
  amber: 'text-amber-600',
  red: 'text-red-600',
};

const URGENCY_BAR: Record<string, string> = {
  green: 'bg-emerald-500',
  amber: 'bg-amber-500',
  red: 'bg-red-500',
};

const PRIORITY_PILL: Record<string, { dot: string; className: string; text: string }> = {
  high: { dot: 'bg-red-500', className: 'bg-red-50 text-red-700', text: 'High Priority' },
  medium: { dot: 'bg-amber-500', className: 'bg-amber-50 text-amber-700', text: 'Medium Priority' },
  low: { dot: 'bg-emerald-500', className: 'bg-emerald-50 text-emerald-700', text: 'Low Priority' },
};

const KanbanCard = ({ task, allTasks, onOpen, onOpenComments, onEdit, onDelete }: KanbanCardProps) => {
  const [showMenu, setShowMenu] = useState(false);
  const blocked = isTaskBlocked(task, allTasks);
  const urgency = getTaskUrgency(task);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task._id,
    disabled: blocked,
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const topPill = task.status === 'completed'
    ? { dot: 'bg-emerald-500', className: 'bg-emerald-50 text-emerald-700', text: 'Completed' }
    : PRIORITY_PILL[task.priority];

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...(blocked ? {} : listeners)}
      onClick={() => onOpen(task)}
      title={blocked ? `Locked until ${blockingDependencies(task, allTasks).map(d => d.title).join(', ')} finishes first` : undefined}
      className={`relative h-[260px] flex flex-col rounded-2xl border shadow-sm transition-all touch-none overflow-hidden ${
        blocked
          ? 'bg-slate-100 border-slate-200 grayscale opacity-75 cursor-pointer'
          : 'bg-white border-slate-200/80 hover:shadow-lg hover:-translate-y-0.5 cursor-grab active:cursor-grabbing'
      }`}
    >
      {blocked && (
        <div className="absolute top-2.5 right-2.5 z-10 w-7 h-7 rounded-full bg-slate-700/90 text-white flex items-center justify-center shadow-sm">
          <Lock className="w-3.5 h-3.5" />
        </div>
      )}

      {task.coverImage && (
        <div className="h-20 w-full bg-slate-100 overflow-hidden flex-shrink-0">
          <img
            src={resolveFileUrl(task.coverImage.url)}
            alt=""
            className="w-full h-full object-cover"
            draggable={false}
          />
        </div>
      )}

      <div className="flex-1 min-h-0 flex flex-col p-3.5 gap-2">
        <div className="flex items-start justify-between gap-2 flex-shrink-0">
          <h4 className="font-semibold text-sm text-slate-900 leading-snug line-clamp-2 min-h-[2.5rem]">{task.title}</h4>
          {!blocked && (
            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium flex-shrink-0 whitespace-nowrap ${topPill.className}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${topPill.dot}`} />
              {topPill.text}
            </span>
          )}
        </div>

        {urgency && (
          <div className={`flex items-center gap-1 text-xs font-medium flex-shrink-0 ${URGENCY_COLOR[urgency.color]}`}>
            <Clock className="w-3.5 h-3.5" />
            {urgency.label}
          </div>
        )}

        <p className="flex-1 min-h-0 overflow-hidden text-xs text-slate-400 line-clamp-2">{task.description}</p>

        <div className="flex items-center justify-between flex-shrink-0">
          <AssigneeAvatarGroup assignees={task.assignees} />
          <div className="flex items-center gap-3 text-slate-400">
            {task.dependencies.length > 0 && (
              <span title={`Depends on ${task.dependencies.length} task${task.dependencies.length > 1 ? 's' : ''}`} className="inline-flex items-center gap-1 text-[11px]">
                <Link2 className="w-3.5 h-3.5" />{task.dependencies.length}
              </span>
            )}
            {task.attachments.length > 0 && (
              <span title={`${task.attachments.length} attachment${task.attachments.length > 1 ? 's' : ''}`} className="inline-flex items-center gap-1 text-[11px]">
                <Paperclip className="w-3.5 h-3.5" />{task.attachments.length}
              </span>
            )}
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); onOpenComments(task); }}
              title="View comments"
              className="inline-flex items-center gap-1 text-[11px] hover:text-primary"
            >
              <MessageSquare className="w-3.5 h-3.5" />{task.comments.length}
            </button>
            <div className="relative flex-shrink-0">
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}
                aria-label="Task actions"
                className="hover:text-slate-600"
              >
                <MoreVertical className="w-3.5 h-3.5" />
              </button>
              {showMenu && (
                <>
                  <div className="fixed inset-0 z-10" onClick={(e) => { e.stopPropagation(); setShowMenu(false); }} onPointerDown={(e) => e.stopPropagation()} />
                  <div className="absolute right-0 bottom-full mb-1 w-32 bg-white rounded-lg shadow-lg border border-slate-200 py-1 z-20">
                    <button
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => { e.stopPropagation(); onEdit(task); setShowMenu(false); }}
                      className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                    >
                      <Pencil className="w-3.5 h-3.5" /> Edit
                    </button>
                    <button
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => { e.stopPropagation(); onDelete(task._id); setShowMenu(false); }}
                      className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Delete
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {urgency && (
        <div className={`absolute bottom-0 left-0 right-0 h-1 ${URGENCY_BAR[urgency.color]}`} />
      )}
    </div>
  );
};

export default KanbanCard;
