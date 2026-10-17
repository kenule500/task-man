import { useEffect, useRef } from 'react';
import { groupByDay } from '../lib/messages';
import type { ChatMessage, Reaction } from '../types';
import MessageItem from './MessageItem';

interface MessageListProps {
  messages: ChatMessage[];
  reactions: Record<string, Reaction[]>;
  currentUserId: string | undefined;
  canWrite: boolean;
  canModerate: boolean;
  loading: boolean;
  loadingOlder: boolean;
  hasMore: boolean;
  error: string;
  emptyCopy: string;
  attachmentHref: (attachmentId: string) => string;
  onLoadOlder: () => void;
  onToggleReaction: (messageId: string, emoji: string) => void;
  onReply: (message: ChatMessage) => void;
  onEdit: (message: ChatMessage, body: string) => void;
  onDelete: (message: ChatMessage) => void;
  onPin: (message: ChatMessage, pinned: boolean) => void;
  /** Announced politely to assistive technology when someone else posts. */
  announcement: string;
}

/** The channel's messages, oldest at the top, with an accessible live region for new arrivals. */
export const MessageList = ({
  messages, reactions, currentUserId, canWrite, canModerate, loading, loadingOlder, hasMore,
  error, emptyCopy, attachmentHref, onLoadOlder, onToggleReaction, onReply, onEdit, onDelete, onPin,
  announcement,
}: MessageListProps) => {
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const previousCount = useRef(0);

  // Follow the conversation: scroll down when it grows at the end, not when older pages are prepended
  useEffect(() => {
    if (messages.length > previousCount.current) {
      bottomRef.current?.scrollIntoView({ block: 'end' });
    }
    previousCount.current = messages.length;
  }, [messages.length]);

  const groups = groupByDay(messages);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* New messages are announced without stealing focus (AC/NFR-003) */}
      <p aria-live="polite" className="sr-only">{announcement}</p>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {hasMore && (
          <div className="p-3 text-center">
            <button
              type="button"
              onClick={onLoadOlder}
              disabled={loadingOlder}
              className="rounded-md border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 outline-none hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-60"
            >
              {loadingOlder ? 'Loading…' : 'Load older messages'}
            </button>
          </div>
        )}

        {loading && <p className="p-4 text-sm text-slate-500">Loading messages…</p>}
        {error && <p role="alert" className="p-4 text-sm text-danger-fg">{error}</p>}

        {!loading && !error && messages.length === 0 && (
          <p className="p-6 text-center text-sm text-slate-500">{emptyCopy}</p>
        )}

        {groups.map(group => (
          <section key={group.key} aria-label={group.label}>
            <h2 className="sticky top-0 z-[1] bg-white/95 px-4 py-1 text-center text-[11px] font-medium uppercase tracking-wide text-slate-400 backdrop-blur">
              {group.label}
            </h2>
            <ul>
              {group.messages.map(message => (
                <MessageItem
                  key={message._id}
                  message={message}
                  reactions={reactions[message._id] ?? []}
                  currentUserId={currentUserId}
                  canWrite={canWrite}
                  canModerate={canModerate}
                  onToggleReaction={onToggleReaction}
                  onReply={onReply}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  onPin={onPin}
                  attachmentHref={attachmentHref}
                />
              ))}
            </ul>
          </section>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
};

export default MessageList;
