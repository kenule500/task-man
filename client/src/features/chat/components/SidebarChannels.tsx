import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import {
  SidebarGroup, SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar,
} from '@/components/ui/sidebar';import { usePermissions } from '@/hooks/usePermissions';
import { getStoredUser } from '@/utils/session';
import { cn } from '@/lib/utils';
import { chatApi } from '../api';
import { allLastRead, setLastRead } from '../lib/readState';
import { unreadCount } from '../lib/messages';
import type { ChatChannel, ChatUser } from '../types';

/**
 * The CHAT group of the sidebar: team, general and project channels, plus the member's direct
 * conversations. Rendered between Main Menu and General, and hidden entirely without chat:read.
 */
export const SidebarChannels = () => {
  const { workspaceSlug } = useParams<{ workspaceSlug: string }>();
  const { pathname } = useLocation();
  const { isMobile, setOpenMobile } = useSidebar();
  const { can, loading } = usePermissions();

  const [channels, setChannels] = useState<ChatChannel[]>([]);
  const [members, setMembers] = useState<ChatUser[]>([]);

  const canRead = !loading && can('chat:read');
  const currentUserId = getStoredUser()?._id;
  // Visiting a channel writes the read state, and the navigation that follows re-reads it here
  const readState = allLastRead();

  useEffect(() => {
    if (!workspaceSlug || !canRead) return undefined;
    let cancelled = false;
    Promise.all([chatApi.channels(workspaceSlug), chatApi.members(workspaceSlug)])
      .then(([list, directory]) => {
        if (cancelled) return;
        setChannels(list.filter(channel => !channel.archived));
        setMembers(directory);
      })      .catch(() => {
        // The chat screen surfaces the failure; the sidebar stays quiet
        if (!cancelled) setChannels([]);
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceSlug, canRead]);

  const visibleChannels = canRead && workspaceSlug
    // Only the two default channels are main-menu entries; project channels live in the team list
    ? channels.filter(channel => channel.mainMenu ?? (channel.kind === 'team' || channel.kind === 'general'))
    : [];

  const nameOf = useCallback((userId: string) => (
    members.find(member => member._id === userId)?.name ?? 'Teammate'
  ), [members]);

  const unreadByChannel: Record<string, number> = {};
  for (const channel of visibleChannels) unreadByChannel[channel._id] = unreadCount(channel, readState);

  if (!canRead || !workspaceSlug || visibleChannels.length === 0) return null;

  const close = () => {
    if (isMobile) setOpenMobile(false);
  };

  return (
    <SidebarGroup data-testid="sidebar-chat">
      <SidebarGroupLabel>Chat</SidebarGroupLabel>
      <SidebarMenu>
        {visibleChannels.map(channel => {
          const href = `/${workspaceSlug}/chat/${channel._id}`;
          const active = pathname === href;
          const unread = unreadByChannel[channel._id] ?? 0;
          const label = channel.kind === 'direct'
            ? nameOf(channel.participants.find(id => id !== currentUserId) ?? '')
            : channel.name;

          return (
            <SidebarMenuItem key={channel._id}>
              <SidebarMenuButton
                isActive={active}
                tooltip={label}
                className="max-md:h-10"
                render={
                  <Link
                    to={href}
                    aria-current={active ? 'page' : undefined}
                    onClick={() => {
                      setLastRead(channel._id);
                      close();
                    }}
                    className="w-full"
                  >
                    <span aria-hidden className="flex size-4 shrink-0 items-center justify-center text-xs opacity-70">
                      {channel.kind === 'direct' ? '·' : '#'}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{label}</span>
                    {unread > 0 && !active && (
                      <>
                        <span aria-hidden className={cn('size-1.5 shrink-0 rounded-full bg-primary')} />
                        <span className="sr-only">Unread messages</span>
                      </>
                    )}
                  </Link>
                }
              />
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
    </SidebarGroup>
  );
};

export default SidebarChannels;
