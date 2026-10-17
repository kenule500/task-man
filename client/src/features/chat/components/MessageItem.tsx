import { useState } from 'react';
import { Pencil, Pin, Reply, Smile, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { UserAvatar } from '@/components/ds';
import { REACTION_CHOICES } from '../lib/reactions';
import type { ChatMessage, Reaction } from '../types';
import { authorOf } from '../types';

interface ReactionBarProps {
  reactions: Reaction[];
  currentUserId: string | undefined;
  onToggle: (emoji: string) => void;
  disabled: boolean;
}

export const ReactionBar = ({ reactions, currentUserId, onToggle, disabled }: ReactionBarProps) => {
  const [open, setOpen] = useState(false);
  if (reactions.length === 0 && disabled) return null;

  return (
    <div className="mt-1 flex flex-wrap items-center gap-1">
      {reactions.map(reaction => {
        const mine = Boolean(currentUserId && reaction.users.includes(currentUserId));
        return (
          <button
            key={reaction.emoji}
            type="button"
            disabled={disabled}
            aria-pressed={mine}
            aria-label={`${reaction.emoji} ${reaction.count}${mine ? ', including you' : ''}`}
            onClick={() => onToggle(reaction.emoji)}
            className={cn(
              'flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs outline-none transition-colors focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-60',
              mine ? 'border-primary/40 bg-primary/10 text-primary' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
            )}
          >
            <span aria-hidden>{reaction.emoji}</span>
            <span>{reaction.count}</span>
          </button>
        );
      })}

      <div className="relative">
        <button
          type="button"
          disabled={disabled}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label="Add a reaction"
          onClick={() => setOpen(value => !value)}
          className="flex size-6 items-center justify-center rounded-full border border-transparent text-slate-400 outline-none hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-60"
        >
          <Smile className="size-3.5" aria-hidden />
        </button>
        {open && (
          <div role="menu" aria-label="Choose a reaction" className="absolute z-10 mt-1 flex gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
            {REACTION_CHOICES.map(emoji => (
              <button
                key={emoji}
                type="button"
                role="menuitem"
                aria-label={`React with ${emoji}`}
                onClick={() => {
                  onToggle(emoji);
                  setOpen(false);
                }}
                className="rounded p-1 text-base outline-none hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-primary"
              >
                <span aria-hidden>{emoji}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

interface MessageItemProps {
  message: ChatMessage;
  reactions: Reaction[];
  currentUserId: string | undefined;
  canWrite: boolean;
  canModerate: boolean;
  onToggleReaction: (messageId: string, emoji: string) => void;
  onReply: (message: ChatMessage) => void;
  onEdit: (message: ChatMessage, body: string) => void;
  onDelete: (message: ChatMessage) => void;
  onPin: (message: ChatMessage, pinned: boolean) => void;
  /** Download URL for an attachment; the view builds it so this component stays free of routing concerns. */
  attachmentHref: (attachmentId: string) => string;
}

const timeOf = (iso: string): string => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
};

const formatSize = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const MessageItem = ({
  message, reactions, currentUserId, canWrite, canModerate,
  onToggleReaction, onReply, onEdit, onDelete, onPin, attachmentHref,
}: MessageItemProps) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.body);

  const author = authorOf(message);
  const mine = Boolean(currentUserId && author?._id === currentUserId);
  const deleted = Boolean(message.deletedAt);
  const canDelete = !deleted && (mine || canModerate);

  if (deleted) {
    return (
      <li className="px-4 py-1.5 text-sm italic text-slate-400">
        This message was deleted
      </li>
    );
  }

  return (
    <li className="group px-4 py-1.5 hover:bg-slate-50/60">
      <div className="flex gap-2.5">
        <UserAvatar name={author?.name ?? '?'} src={author?.avatarUrl} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-sm font-semibold text-slate-900">{author?.name ?? 'Unknown member'}</span>
            <time dateTime={message.createdAt} className="text-xs text-slate-500">{timeOf(message.createdAt)}</time>
            {message.editedAt && <span className="text-xs text-slate-400">(edited)</span>}
            {message.pinnedAt && (
              <span className="flex items-center gap-0.5 text-xs text-warning-fg">
                <Pin className="size-3" aria-hidden /> Pinned
              </span>
            )}
          </div>

          {editing ? (
            <form
              className="mt-1 flex flex-col gap-1"
              onSubmit={event => {
                event.preventDefault();
                const next = draft.trim();
                if (!next) return;
                onEdit(message, next);
                setEditing(false);
              }}
            >
              <textarea
                value={draft}
                onChange={event => setDraft(event.target.value)}
                aria-label="Edit message"
                rows={2}
                className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm outline-none focus-visible:outline-2 focus-visible:outline-primary"
              />
              <div className="flex gap-2">
                <button type="submit" className="rounded-md bg-primary px-2 py-1 text-xs font-medium text-white">Save</button>
                <button
                  type="button"
                  onClick={() => { setEditing(false); setDraft(message.body); }}
                  className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <p className="whitespace-pre-wrap break-words text-sm text-slate-800">{message.body}</p>
          )}

          {message.attachments.length > 0 && (
            <ul className="mt-1 space-y-1">
              {message.attachments.map(attachment => (
                <li key={attachment.id}>
                  <a
                    href={attachmentHref(attachment.id)}
                    className="text-xs font-medium text-primary underline underline-offset-2"
                    download={attachment.name}
                  >
                    {attachment.name}
                  </a>
                  <span className="ml-1 text-xs text-slate-400">{formatSize(attachment.size)}</span>
                </li>
              ))}
            </ul>
          )}

          <ReactionBar
            reactions={reactions}
            currentUserId={currentUserId}
            disabled={!canWrite}
            onToggle={emoji => onToggleReaction(message._id, emoji)}
          />

          {message.replyCount > 0 && (
            <button
              type="button"
              onClick={() => onReply(message)}
              className="mt-1 text-xs font-medium text-primary underline underline-offset-2"
            >
              {message.replyCount} {message.replyCount === 1 ? 'reply' : 'replies'}
            </button>
          )}
        </div>

        {/* Row actions: always reachable by keyboard, revealed on hover for the pointer */}
        <div className="flex shrink-0 items-start gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
          <button
            type="button"
            aria-label="Reply in thread"
            onClick={() => onReply(message)}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-primary"
          >
            <Reply className="size-3.5" aria-hidden />
          </button>
          <button
            type="button"
            aria-label={message.pinnedAt ? 'Unpin message' : 'Pin message'}
            onClick={() => onPin(message, !message.pinnedAt)}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-primary"
          >
            <Pin className="size-3.5" aria-hidden />
          </button>
          {mine && (
            <button
              type="button"
              aria-label="Edit message"
              onClick={() => setEditing(true)}
              className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-primary"
            >
              <Pencil className="size-3.5" aria-hidden />
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              aria-label="Delete message"
              onClick={() => onDelete(message)}
              className="rounded p-1 text-slate-400 hover:bg-danger-bg hover:text-danger-fg focus-visible:outline-2 focus-visible:outline-primary"
            >
              <Trash2 className="size-3.5" aria-hidden />
            </button>
          )}
        </div>
      </div>
    </li>
  );
};

export default MessageItem;
