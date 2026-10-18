import { Lock } from 'lucide-react';
import { ConversationSection } from './ConversationSection';
import type { ConversationCard } from '../types';

interface DirectMessageListProps {
  directs: ConversationCard[];
  currentChannelId: string | undefined;
  loading: boolean;
  onSelect: (channelId: string) => void;
  className?: string;
}

/**
 * The direct-message segment. It renders through the same component as the team channels so both
 * sections are segmented and read identically (spec AC-056).
 */
export const DirectMessageList = ({
  directs, currentChannelId, loading, onSelect, className,
}: DirectMessageListProps) => (
  <ConversationSection
    title="Direct messages"
    items={directs}
    currentChannelId={currentChannelId}
    loading={loading}
    loadingCopy="Loading direct messages…"
    emptyCopy="No direct messages yet. Start one with “New direct message”."
    footer={(
      <span className="flex items-center gap-1">
        <Lock className="size-3" aria-hidden />
        <span>Only you and the other person can read a direct message</span>
      </span>
    )}
    onSelect={onSelect}
    className={className}
  />
);

export default DirectMessageList;
