import { useState } from 'react';
import { Pencil, Pin, Reply, Smile, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { UserAvatar } from '@/components/ds';
import { resolveAuthor } from '../lib/authors';
import { codeOnlySegment, parseBody } from '../lib/code';
import { segmentMentions } from '../lib/mentions';
import { REACTION_CHOICES } from '../lib/reactions';
import type { ChatMessage, ChatUser, Reaction } from '../types';
import AttachmentCard from './AttachmentCard';
import CodeCard from './CodeCard';

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
  /** Known member names, used to highlight @mentions the way a chat app does. */
  memberNames: readonly string[];
  /** The channel's member directory, so an author id can be resolved to a name and avatar (FR-092). */
  directory?: readonly ChatUser[];
  canWrite: boolean;
  canModerate: boolean;
  onToggleReaction: (messageId: string, emoji: string) => void;
  onReply: (message: ChatMessage) => void;
  onEdit: (message: ChatMessage, body: string) => void;
  onDelete: (message: ChatMessage) => void;
  onPin: (message: ChatMessage, pinned: boolean) => void;
  /** Workspace slug used to fetch attachment bytes through the authenticated client (FR-086). */
  slug?: string;
  /** The search jump just landed here; the highlight clears on its own (spec AC-074). */
  highlighted?: boolean;
}

const timeOf = (iso: string): string => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
};

/**
 * One message. The caller's own messages sit on the right in a tinted bubble and everyone else's on the
 * left with an avatar, so a conversation reads the way a group chat does.
 */
export const MessageItem = ({
  message, reactions, currentUserId, memberNames, directory = [], canWrite, canModerate,
  onToggleReaction, onReply, onEdit, onDelete, onPin, slug, highlighted = false,
}: MessageItemProps) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.body);

  const author = resolveAuthor(message, directory);
  const mine = Boolean(currentUserId && author._id === currentUserId);
  const deleted = Boolean(message.deletedAt);
  const canDelete = !deleted && (mine || canModerate);
  const segments = parseBody(message.body);
  const codeOnly = !editing && !deleted ? codeOnlySegment(message.body) : null;

  if (deleted) {
    return (
      <li
        id={`message-${message._id}`}
        data-message-id={message._id}
        className={cn('flex px-4 py-1.5', mine ? 'justify-end' : 'justify-start')}
      >
        <span className="text-xs italic text-slate-400">This message was deleted</span>
      </li>
    );
  }

  return (
    <li
      id={`message-${message._id}`}
      data-message-id={message._id}
      className={cn(
        'group flex px-4 py-1.5 transition-colors',
        mine ? 'justify-end' : 'justify-start',
        highlighted && 'bg-warning-bg/60',
      )}
    >
      <div className={cn('flex max-w-[85%] gap-2 md:max-w-[70%]', mine ? 'flex-row-reverse' : 'flex-row')}>
        {/* The caller does not need their own avatar; other people's identify the speaker */}
        {!mine && <UserAvatar name={author.name} src={author.avatarUrl} size="sm" />}

        <div className="min-w-0">
          <div className={cn('flex flex-wrap items-baseline gap-2', mine && 'justify-end')}>
            {!mine && <span className="text-sm font-semibold text-slate-900">{author.name}</span>}
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
          ) : codeOnly ? (
            // A body that is entirely code reads as a code card on its own (AC-084)
            <CodeCard code={codeOnly.code} language={codeOnly.language} className="w-full" />
          ) : (
            <div
              className={cn(
                'mt-0.5 inline-block max-w-full rounded-2xl px-3 py-1.5 text-left text-sm',
                mine ? 'rounded-br-sm bg-primary/10 text-slate-900' : 'rounded-bl-sm bg-slate-100 text-slate-800',
              )}
            >
              {/* Prose around a snippet stays prose; only the fenced part becomes a card (NFR-037) */}
              {segments.map((segment, index) => (
                segment.kind === 'code' ? (
                  <CodeCard
                    key={index}
                    code={segment.code}
                    language={segment.language}
                    label={segment.language}
                    className="w-full"
                  />
                ) : (
                  <p key={index} className="whitespace-pre-wrap break-words">
                    {segmentMentions(segment.text, memberNames).map((part, partIndex) => (
                      part.isMention
                        // Mentions stand out the way they do in a group chat (spec AC-052)
                        ? <span key={partIndex} className="rounded bg-primary/15 px-1 font-medium text-primary">{part.text}</span>
                        : <span key={partIndex}>{part.text}</span>
                    ))}
                  </p>
                )
              ))}
            </div>
          )}

          {message.attachments.length > 0 && (
            // Each attachment is a card, never a link to the protected API route (FR-085, AC-088)
            <ul className={cn('mt-1 flex flex-col gap-1', mine && 'items-end')}>
              {message.attachments.map(attachment => (
                <li key={attachment.id}>
                  <AttachmentCard slug={slug} attachment={attachment} />
                </li>
              ))}
            </ul>
          )}

          <div className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
            <ReactionBar
              reactions={reactions}
              currentUserId={currentUserId}
              disabled={!canWrite}
              onToggle={emoji => onToggleReaction(message._id, emoji)}
            />
          </div>

          {message.replyCount > 0 && (
            <button
              type="button"
              onClick={() => onReply(message)}
              className={cn('mt-1 block text-xs font-medium text-primary underline underline-offset-2', mine && 'ml-auto')}
            >
              {message.replyCount} {message.replyCount === 1 ? 'reply' : 'replies'}
            </button>
          )}
        </div>

        {/* Row actions: reachable by keyboard, revealed on hover for the pointer */}
        <div className="flex shrink-0 items-start gap-0.5 self-start opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
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
