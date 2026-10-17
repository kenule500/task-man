import { Hash, Lock, Search, Pin, Users } from 'lucide-react';
import { TooltipHint } from '@/components/ds';
import type { ChatChannel } from '../types';

interface ChatHeaderProps {
  channel: ChatChannel;
  label: string;
  onlineUserIds: string[];
  memberCount: number;
  transport: 'connecting' | 'live' | 'degraded';
  onOpenSearch: () => void;
  onTogglePins: () => void;
  onOpenMembers: () => void;
}

const TRANSPORT_COPY = {
  live: 'Live',
  connecting: 'Connecting',
  degraded: 'Reconnecting — updates may lag',
} as const;

/** Channel title, presence summary and the tools that belong to the conversation. */
export const ChatHeader = ({
  channel, label, onlineUserIds, memberCount, transport, onOpenSearch, onTogglePins, onOpenMembers,
}: ChatHeaderProps) => {
  const Glyph = channel.kind === 'direct' ? Lock : Hash;
  const online = onlineUserIds.length;
  // A direct conversation has no shared purpose to state
  const purpose = channel.kind === 'direct' ? '' : channel.description;

  return (
    <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-2.5">
      <Glyph className="size-4 shrink-0 text-slate-400" aria-hidden />
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-sm font-semibold text-slate-900">{label}</h1>
        <p className="flex items-center gap-1.5 truncate text-xs text-slate-500">
          {channel.archived ? (
            <span className="text-warning-fg">Project deleted — this conversation is read-only</span>
          ) : (
            <>
              <span
                aria-hidden
                className={online > 0 ? 'size-1.5 rounded-full bg-success-fg' : 'size-1.5 rounded-full bg-slate-300'}
              />
              <span className="shrink-0">{online > 0 ? `${online} online` : 'No one else online'}</span>
              <span aria-hidden>·</span>
              <span className="shrink-0">{TRANSPORT_COPY[transport]}</span>
              {purpose && (
                <>
                  <span aria-hidden>·</span>
                  <span className="truncate text-slate-400">{purpose}</span>
                </>
              )}
            </>
          )}
        </p>
      </div>

      <div className="flex items-center gap-0.5">
        <TooltipHint label="Search this channel">
          <button
            type="button"
            aria-label="Search this channel"
            onClick={onOpenSearch}
            className="flex size-8 items-center justify-center rounded-md text-slate-500 outline-none hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-primary"
          >
            <Search className="size-4" aria-hidden />
          </button>
        </TooltipHint>
        <TooltipHint label="Pinned messages">
          <button
            type="button"
            aria-label="Pinned messages"
            onClick={onTogglePins}
            className="flex size-8 items-center justify-center rounded-md text-slate-500 outline-none hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-primary"
          >
            <Pin className="size-4" aria-hidden />
          </button>
        </TooltipHint>
        <TooltipHint label={`${memberCount} ${memberCount === 1 ? 'member' : 'members'}`}>
          <button
            type="button"
            aria-label={`Members, ${memberCount} in this channel`}
            onClick={onOpenMembers}
            className="flex size-8 items-center justify-center rounded-md text-slate-500 outline-none hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-primary"
          >
            <Users className="size-4" aria-hidden />
          </button>
        </TooltipHint>
      </div>
    </header>
  );
};

export default ChatHeader;
