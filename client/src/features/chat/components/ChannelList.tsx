import { useState } from 'react';
import { Hash, Lock, MessageSquarePlus, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ChatChannel, ChatUser } from '../types';

interface ChannelListProps {
  channels: ChatChannel[];
  currentChannelId: string | undefined;
  currentUserId: string | undefined;
  members: ChatUser[];
  unreadByChannel: Record<string, number>;
  nameOf: (userId: string) => string;
  onSelect: (channelId: string) => void;
  canStartDirect: boolean;
  onStartDirect: (userId: string) => void;
  /** Rendered inside the sidebar, which closes its sheet on navigation. */
  className?: string;
}

const glyphFor = (channel: ChatChannel) => (channel.kind === 'direct' ? Lock : Hash);

/** Channel list used by the sidebar's CHAT group. */
export const ChannelList = ({
  channels, currentChannelId, currentUserId, members, unreadByChannel, nameOf,
  onSelect, canStartDirect, onStartDirect, className,
}: ChannelListProps) => {
  const [picking, setPicking] = useState(false);

  const others = members.filter(member => member._id !== currentUserId);

  return (
    <div className={cn('flex flex-col gap-0.5', className)}>
      {/* "New direct message" comes first, then the conversations, then the team channels below (spec AC-050) */}
      {canStartDirect && others.length > 0 && (
        <div>
          <button
            type="button"
            aria-expanded={picking}
            onClick={() => setPicking(value => !value)}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-slate-500 outline-none hover:bg-sidebar-accent/60 focus-visible:outline-2 focus-visible:outline-primary"
          >
            {picking ? <Plus className="size-3.5" aria-hidden /> : <MessageSquarePlus className="size-3.5" aria-hidden />}
            <span>{picking ? 'Choose a teammate' : 'New direct message'}</span>
          </button>
          {picking && (
            <ul className="mt-1 max-h-48 overflow-y-auto" aria-label="Teammates">
              {others.map(member => (
                <li key={member._id}>
                  <button
                    type="button"
                    onClick={() => {
                      onStartDirect(member._id);
                      setPicking(false);
                    }}
                    className="w-full truncate rounded-md px-2 py-1 text-left text-xs text-slate-600 outline-none hover:bg-sidebar-accent/60 focus-visible:outline-2 focus-visible:outline-primary"
                  >
                    {member.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <ul className="flex flex-col gap-0.5">
        {channels.map(channel => {
          const Glyph = glyphFor(channel);
          const active = channel._id === currentChannelId;
          const unread = unreadByChannel[channel._id] ?? (channel.unread ? 1 : 0);
          const label = channel.kind === 'direct'
            ? nameOf(channel.participants.find(id => id !== currentUserId) ?? '')
            : channel.name;

          return (
            <li key={channel._id}>
              <button
                type="button"
                onClick={() => onSelect(channel._id)}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none transition-colors',
                  'focus-visible:outline-2 focus-visible:outline-primary',
                  active ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground' : 'text-sidebar-foreground hover:bg-sidebar-accent/60',
                )}
              >
                <Glyph className="size-3.5 shrink-0 opacity-70" aria-hidden />
                <span className={cn('min-w-0 flex-1 truncate', unread > 0 && !active && 'font-semibold')}>{label}</span>
                {unread > 0 && !active && (
                  <>
                    <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-primary" />
                    <span className="sr-only">Unread messages</span>
                  </>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default ChannelList;
