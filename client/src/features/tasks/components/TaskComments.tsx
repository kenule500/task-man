import { useState, type KeyboardEvent } from 'react';
import { MessageSquare, Send, Trash2 } from 'lucide-react';
import { SectionHeader, UserAvatar, toast } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { getApiErrorMessage } from '../api';
import { formatRelativeTime } from '../lib/date';
import type { TaskComment } from '../types';

const MAX_COMMENT_LENGTH = 2000;

export interface TaskCommentsProps {
  comments: TaskComment[];
  currentUserId?: string;
  /** Adding and deleting comments needs `tasks:write`. */
  canWrite: boolean;
  onAdd: (text: string) => Promise<void>;
  onRemove: (commentId: string) => Promise<void>;
}

const TaskComments = ({ comments, currentUserId, canWrite, onAdd, onRemove }: TaskCommentsProps) => {
  const [text, setText] = useState('');
  const [posting, setPosting] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const trimmed = text.trim();

  const post = async () => {
    if (!trimmed || posting) return;
    setPosting(true);
    try {
      await onAdd(trimmed);
      setText('');
      toast.success('Comment added');
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Could not add the comment.'));
    } finally {
      setPosting(false);
    }
  };

  const remove = async (comment: TaskComment) => {
    setRemovingId(comment._id);
    try {
      await onRemove(comment._id);
      toast.success('Comment deleted');
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Could not delete the comment.'));
    } finally {
      setRemovingId(null);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      void post();
    }
  };

  return (
    <section aria-label="Comments">
      <SectionHeader title="Comments" count={comments.length} icon={<MessageSquare className="size-4 text-slate-400" aria-hidden />} className="mb-2" />

      {comments.length === 0 ? (
        <p className="text-sm text-slate-400">No comments yet.</p>
      ) : (
        <ul className="space-y-4">
          {comments.map(comment => {
            const own = canWrite && Boolean(currentUserId) && comment.author?._id === currentUserId;
            return (
              <li key={comment._id} className="flex items-start gap-3">
                <UserAvatar name={comment.author?.name || 'Unknown'} src={comment.author?.avatarUrl || undefined} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
                    <span className="font-medium text-slate-800">{comment.author?.name || 'Unknown'}</span>
                    <time dateTime={comment.createdAt} title={new Date(comment.createdAt).toLocaleString()} className="text-xs text-slate-500">
                      {formatRelativeTime(comment.createdAt)}
                    </time>
                  </p>
                  <p className="mt-0.5 text-sm whitespace-pre-wrap text-slate-700 [overflow-wrap:anywhere]">{comment.text}</p>
                </div>
                {own && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Delete comment"
                    disabled={removingId === comment._id}
                    onClick={() => void remove(comment)}
                    className="size-10 shrink-0 text-slate-400 hover:bg-red-50 hover:text-red-600 sm:size-8"
                  >
                    <Trash2 />
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {canWrite && (
        <div className="mt-4 space-y-2">
          <label htmlFor="task-comment" className="sr-only">Add a comment</label>
          <Textarea
            id="task-comment"
            value={text}
            onChange={event => setText(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Write a comment..."
            maxLength={MAX_COMMENT_LENGTH}
            rows={2}
            className="min-h-16 rounded-lg border border-gray-300 bg-white text-base text-slate-900 shadow-none placeholder:text-slate-400 focus-visible:border-gray-400 focus-visible:ring-0 sm:text-sm"
          />
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-slate-400">Ctrl or Cmd + Enter to send</p>
            <Button
              type="button"
              disabled={!trimmed || posting}
              onClick={() => void post()}
              className="h-10 gap-1.5 bg-primary text-white hover:bg-primary-hover sm:h-9"
            >
              <Send className="size-4" aria-hidden /> {posting ? 'Sending...' : 'Comment'}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
};

export default TaskComments;
