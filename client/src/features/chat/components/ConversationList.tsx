import { cn } from '@/lib/utils';
import { ConversationRow } from './ConversationRow';
import type { ConversationCard } from '../types';

interface ConversationListProps {
  items: ConversationCard[];
  currentChannelId: string | undefined;
  loading: boolean;
  /** Rows that offer rename and avatar settings (project channels only). */
  canManage: boolean;
  onSelect: (channelId: string) => void;
  onOpenSettings: (card: ConversationCard) => void;
  className?: string;
}

/**
 * The conversation list: every channel and direct message in one run of rows, newest activity first
 * (AC-114). It replaces the two labelled segments, so a conversation that just received a message
 * rises to the top of the same list the member is already reading.
 *
 * It owns its own scroll container: the pane never scrolls the page, and scrolling the messages leaves
 * this list where it was (AC-104, NFR-042).
 */
export const ConversationList = ({
  items, currentChannelId, loading, canManage, onSelect, onOpenSettings, className,
}: ConversationListProps) => (
  <nav aria-label="Conversations" className={cn('flex min-h-0 flex-col', className)}>
    <h2 className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
      Conversations
    </h2>

    {loading && <p className="px-3 py-2 text-xs text-slate-500">Loading conversations...</p>}

    {!loading && items.length === 0 && (
      <p className="px-3 py-2 text-xs text-slate-500">
        No conversations yet. Assign yourself a task in a project to join its channel, or start a direct
        message.
      </p>
    )}

    <ul className="min-h-0 flex-1 overflow-y-auto">
      {items.map(card => (
        <ConversationRow
          key={card._id}
          card={card}
          active={card._id === currentChannelId}
          canManage={canManage}
          onSelect={onSelect}
          onOpenSettings={onOpenSettings}
        />
      ))}
    </ul>
  </nav>
);

export default ConversationList;
