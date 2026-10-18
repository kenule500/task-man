import { Lock } from 'lucide-react';
import { ConversationSection } from './ConversationSection';
import type { ConversationCard } from '../types';

interface TeamChannelListProps {
  teams: ConversationCard[];
  currentChannelId: string | undefined;
  loading: boolean;
  canManage: boolean;
  onSelect: (channelId: string) => void;
  onOpenSettings: (team: ConversationCard) => void;
  className?: string;
}

/** The team-channel segment: a project's conversation, readable by its members. */
export const TeamChannelList = ({
  teams, currentChannelId, loading, canManage, onSelect, onOpenSettings, className,
}: TeamChannelListProps) => (
  <ConversationSection
    title="Team channels"
    items={teams}
    currentChannelId={currentChannelId}
    loading={loading}
    loadingCopy="Loading team channels…"
    emptyCopy="You are not on any project yet. Assign yourself a task in a project to join its channel."
    footer={(
      <span className="flex items-center gap-1">
        <Lock className="size-3" aria-hidden />
        <span>Only project members can read a team channel</span>
      </span>
    )}
    canManage={canManage}
    onSelect={onSelect}
    onOpenSettings={onOpenSettings}
    className={className}
  />
);

export default TeamChannelList;
