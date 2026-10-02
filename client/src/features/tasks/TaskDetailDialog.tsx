import { useEffect, useRef, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  CalendarClock, Clapperboard, File as FileIcon, FileArchive, FileSpreadsheet,
  FileText, Image as ImageIcon, Link2, Lock, MessageSquare, Paperclip, Send, Trash2,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { Task, TaskMember } from './types';
import { blockingDependencies, formatStatusLabel, getTaskUrgency, isTaskBlocked } from './types';
import { AssigneeAvatarGroup, LabelPill, PriorityBadge, StatusBadge } from './components/TaskBadges';
import { fileKindFromMimetype, formatFileSize, resolveFileUrl } from './fileHelpers';
import { getAvatarColor } from './labelColors';

interface TaskDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: Task | null;
  allTasks: Task[];
  currentUserId?: string;
  autoFocusComments?: boolean;
  onDelete: (taskId: string) => void;
  onAddComment: (taskId: string, text: string) => Promise<Task>;
  onRemoveComment: (taskId: string, commentId: string) => Promise<Task>;
}

const FILE_KIND_ICON: Record<string, typeof FileIcon> = {
  image: ImageIcon,
  pdf: FileText,
  spreadsheet: FileSpreadsheet,
  presentation: Clapperboard,
  document: FileText,
  archive: FileArchive,
  other: FileIcon,
};

const URGENCY_BAR_COLOR: Record<string, string> = {
  green: 'bg-emerald-500',
  amber: 'bg-amber-500',
  red: 'bg-red-500',
};

const CommentAuthorAvatar = ({ author }: { author: TaskMember }) => (
  <div
    style={{ backgroundColor: getAvatarColor(author?.name || '?') }}
    className="w-7 h-7 rounded-full text-white text-xs font-semibold flex items-center justify-center flex-shrink-0"
  >
    {author?.name?.trim()?.charAt(0)?.toUpperCase() || '?'}
  </div>
);

const TaskDetailDialog = ({
  open, onOpenChange, task, allTasks, currentUserId, autoFocusComments, onDelete, onAddComment, onRemoveComment,
}: TaskDetailDialogProps) => {
  const [commentText, setCommentText] = useState('');
  const [posting, setPosting] = useState(false);
  const commentInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && autoFocusComments) {
      const id = setTimeout(() => {
        commentInputRef.current?.focus();
        commentInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 50);
      return () => clearTimeout(id);
    }
  }, [open, autoFocusComments, task?._id]);

  if (!task) return null;

  const blocked = isTaskBlocked(task, allTasks);
  const blockers = blockingDependencies(task, allTasks);
  const urgency = getTaskUrgency(task);

  const handlePostComment = async () => {
    if (!commentText.trim() || posting) return;
    setPosting(true);
    try {
      await onAddComment(task._id, commentText.trim());
      setCommentText('');
    } catch (err) {
      console.error('addComment error:', err);
    } finally {
      setPosting(false);
    }
  };

  if (blocked) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[480px] p-0 overflow-hidden bg-white border border-gray-200 shadow-2xl gap-0">
          <div className="flex flex-col items-center text-center px-8 py-10 space-y-5">
            <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center">
              <Lock className="w-6 h-6 text-slate-400" />
            </div>
            <DialogHeader className="p-0 space-y-2 items-center">
              <DialogTitle className="text-lg font-bold text-slate-900 text-center">{task.title}</DialogTitle>
            </DialogHeader>
            {task.description && (
              <p className="text-sm text-slate-500 leading-relaxed">{task.description}</p>
            )}
            <div className="bg-slate-50 border border-slate-200 rounded-xl px-5 py-4">
              <p className="text-sm text-slate-600 leading-relaxed">
                This task will be active when you finish{' '}
                <span className="font-semibold text-slate-800">
                  {blockers.map(b => `"${b.title}"`).join(', ')}
                </span>
                .
              </p>
            </div>
          </div>
          <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
            <button
              onClick={() => onDelete(task._id)}
              className="flex items-center gap-1.5 text-sm font-medium text-red-600 hover:text-red-700"
            >
              <Trash2 className="w-4 h-4" /> Delete
            </button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] p-0 overflow-hidden bg-white border border-gray-200 shadow-2xl gap-0 max-h-[88vh] flex flex-col">
        <div className="overflow-y-auto flex-1">
          {task.coverImage && (
            <div className="h-40 w-full bg-slate-100">
              <img src={resolveFileUrl(task.coverImage.url)} alt="" className="w-full h-full object-cover" />
            </div>
          )}

          <div className="p-6 space-y-5">
            <DialogHeader className="p-0 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <StatusBadge status={task.status} />
                <PriorityBadge priority={task.priority} />
              </div>
              <DialogTitle className="text-xl font-bold text-slate-900 leading-snug">{task.title}</DialogTitle>
            </DialogHeader>

            {task.labels.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {task.labels.map(label => <LabelPill key={label} label={label} />)}
              </div>
            )}

            {task.description && (
              <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">{task.description}</p>
            )}

            {urgency && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 text-slate-500">
                    <CalendarClock className="w-3.5 h-3.5" /> {urgency.label}
                  </span>
                  <span className="text-slate-400">
                    Due {new Date(task.deadline as string).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${URGENCY_BAR_COLOR[urgency.color]}`}
                    style={{ width: `${urgency.percent}%` }}
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="space-y-1">
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Assignees</p>
                <AssigneeAvatarGroup assignees={task.assignees} size="md" max={5} />
              </div>
              {task.dependencies.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-slate-400 uppercase tracking-wide flex items-center gap-1">
                    <Link2 className="w-3 h-3" /> Depends on
                  </p>
                  <div className="space-y-1">
                    {task.dependencies.map(dep => (
                      <div key={dep._id} className="flex items-center gap-1.5 text-xs text-slate-600">
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dep.status === 'completed' ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                        <span className="truncate">{dep.title}</span>
                        <span className="text-slate-400 flex-shrink-0">· {formatStatusLabel(dep.status)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {task.attachments.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wide flex items-center gap-1">
                  <Paperclip className="w-3 h-3" /> Attachments ({task.attachments.length})
                </p>
                <div className="space-y-1.5">
                  {task.attachments.map(a => {
                    const Icon = FILE_KIND_ICON[fileKindFromMimetype(a.mimetype)];
                    return (
                      <a
                        key={a._id}
                        href={resolveFileUrl(a.url)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-2 text-sm hover:bg-slate-50"
                      >
                        <Icon className="w-4 h-4 text-slate-400 flex-shrink-0" />
                        <span className="truncate flex-1 text-slate-700">{a.originalName}</span>
                        <span className="text-xs text-slate-400 flex-shrink-0">{formatFileSize(a.size)}</span>
                      </a>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="space-y-3 pt-2 border-t border-slate-100">
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wide flex items-center gap-1">
                <MessageSquare className="w-3 h-3" /> Comments ({task.comments.length})
              </p>

              {task.comments.length > 0 && (
                <div className="space-y-3">
                  {task.comments.map(comment => (
                    <div key={comment._id} className="flex items-start gap-2.5 group">
                      <CommentAuthorAvatar author={comment.author} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2">
                          <span className="text-sm font-medium text-slate-800">{comment.author?.name || 'Unknown'}</span>
                          <span className="text-xs text-slate-400">{formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}</span>
                        </div>
                        <p className="text-sm text-slate-600 whitespace-pre-wrap">{comment.text}</p>
                      </div>
                      {currentUserId && comment.author?._id === currentUserId && (
                        <button
                          onClick={() => onRemoveComment(task._id, comment._id)}
                          className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 flex-shrink-0"
                          aria-label="Delete comment"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-2">
                <input
                  ref={commentInputRef}
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handlePostComment(); } }}
                  placeholder="Write a comment…"
                  maxLength={2000}
                  className="flex-1 h-10 bg-white border border-gray-300 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus-visible:border-gray-400 focus-visible:ring-0 shadow-none outline-none px-3"
                />
                <button
                  onClick={handlePostComment}
                  disabled={!commentText.trim() || posting}
                  aria-label="Post comment"
                  className="h-10 w-10 flex items-center justify-center rounded-lg bg-primary text-white hover:bg-primary-hover disabled:opacity-40 flex-shrink-0"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex-shrink-0">
          <button
            onClick={() => onDelete(task._id)}
            className="flex items-center gap-1.5 text-sm font-medium text-red-600 hover:text-red-700"
          >
            <Trash2 className="w-4 h-4" /> Delete
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default TaskDetailDialog;
