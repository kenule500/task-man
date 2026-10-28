import { useEffect, useRef } from 'react';
import { groupByDay } from '../lib/messages';
import type { ChatMessage, ChatUser, Reaction } from '../types';
import MessageItem from './MessageItem';

interface MessageListProps {
  messages: ChatMessage[];
  reactions: Record<string, Reaction[]>;
  currentUserId: string | undefined;
  /** Known member names, so @mentions render highlighted. */
  memberNames: readonly string[];
  /** The channel's member directory, so an author id resolves to a name and avatar (FR-092). */
  directory?: readonly ChatUser[];
  canWrite: boolean;
  canModerate: boolean;
  loading: boolean;
  loadingOlder: boolean;
  hasMore: boolean;
  error: string;
  emptyCopy: string;
  /** Workspace slug used to fetch attachment bytes through the authenticated client (FR-086). */
  slug?: string;
  /** A message the search jumped to: scroll to it and let the list flash it (spec AC-074). */
  scrollTo?: { id: string; nonce: number } | null;
  highlightedMessageId?: string | null;
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
  messages, reactions, currentUserId, memberNames, directory, canWrite, canModerate, loading, loadingOlder, hasMore,
  error, emptyCopy, slug, scrollTo, highlightedMessageId, onLoadOlder, onToggleReaction, onReply,
  onEdit, onDelete, onPin, announcement,
}: MessageListProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const previousCount = useRef(0);

  // Follow the conversation: scroll down when it grows at the end, not when older pages are prepended
  useEffect(() => {
    if (messages.length > previousCount.current) {
      bottomRef.current?.scrollIntoView({ block: 'end' });
    }
    previousCount.current = messages.length;
  }, [messages.length]);

  // A search jump wins over "follow the newest message"
  useEffect(() => {
    if (!scrollTo) return;
    const target = containerRef.current?.querySelector(`[data-message-id="${scrollTo.id}"]`);
    target?.scrollIntoView({ block: 'center' });
  }, [scrollTo]);

  const groups = groupByDay(messages);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* New messages are announced without stealing focus (AC/NFR-003) */}
      <p aria-live="polite" className="sr-only">{announcement}</p>

      <div ref={containerRef} className="min-h-0 flex-1 overflow-y-auto">
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
                  memberNames={memberNames}
                  directory={directory}
                  canWrite={canWrite}
                  canModerate={canModerate}
                  onToggleReaction={onToggleReaction}
                  onReply={onReply}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  onPin={onPin}
                  slug={slug}
                  highlighted={message._id === highlightedMessageId}
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
