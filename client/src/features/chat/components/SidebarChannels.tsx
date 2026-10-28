import { useCallback, useEffect, useReducer, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import {
  SidebarGroup, SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar,
} from '@/components/ui/sidebar';
import { usePermissions } from '@/hooks/usePermissions';
import { getStoredUser } from '@/utils/session';
import { chatApi } from '../api';
import { onConversations } from '../lib/conversationEvents';
import { allLastRead, setLastRead } from '../lib/readState';
import { unreadCount } from '../lib/messages';
import type { ChatChannel, ChatUser } from '../types';

/**
 * The direct-message rows of the sidebar's chat group.
 *
 * The group itself and the single `Project chat` destination belong to `Sidebar`; this list only adds
 * the member's direct conversations, so the seeded channels are no longer two ambiguous sidebar rows
 * (AC-100, AC-102). It is hidden without `chat:read` and when the member has no direct conversation.
 *
 * The chat screen announces a grant, a rename or a read through `conversationEvents`, so the sidebar
 * never needs its own socket and the two panes cannot disagree (AC-113).
 */
export const SidebarChannels = () => {
  const { workspaceSlug } = useParams<{ workspaceSlug: string }>();
  const { pathname } = useLocation();
  const { isMobile, setOpenMobile } = useSidebar();
  const { can, loading } = usePermissions();

  const [channels, setChannels] = useState<ChatChannel[]>([]);
  const [members, setMembers] = useState<ChatUser[]>([]);
  // A grant or a rename means the list itself changed; a read only means the rows must repaint
  const [reloads, setReloads] = useState(0);
  // A read does not change the list, only its badge, so it forces a repaint and nothing else
  const [, repaint] = useReducer((count: number) => count + 1, 0);

  const canRead = !loading && can('chat:read');
  const currentUserId = getStoredUser()?._id;
  // Visiting a conversation writes the read state; every render re-reads it, so a badge clears at once
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
  }, [workspaceSlug, canRead, reloads]);

  useEffect(() => onConversations(kind => {
    if (kind === 'channels') setReloads(value => value + 1);
    else repaint();
  }), []);

  // Only direct conversations are sidebar rows: the seeded channels live in the conversation list
  const conversations = canRead && workspaceSlug
    ? channels.filter(channel => channel.kind === 'direct')
    : [];

  const nameOf = useCallback((userId: string) => (
    members.find(member => member._id === userId)?.name ?? 'Teammate'
  ), [members]);

  if (!canRead || !workspaceSlug || conversations.length === 0) return null;

  const close = () => {
    if (isMobile) setOpenMobile(false);
  };

  return (
    <SidebarGroup data-testid="sidebar-chat">
      <SidebarMenu>
        {conversations.map(channel => {
          const href = `/${workspaceSlug}/chat/${channel._id}`;
          const active = pathname === href;
          // The member's own read state decides; the server flag only covers a conversation this
          // browser has never opened, so a stale flag cannot re-light a cleared badge (AC-111)
          const seen = readState[channel._id];
          const unread = seen ? unreadCount(channel, readState) : (channel.unread ? 1 : 0);
          const label = nameOf(channel.participants.find(id => id !== currentUserId) ?? '');

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
                      ·
                    </span>
                    <span className="min-w-0 flex-1 truncate">{label}</span>
                    {unread > 0 && !active && (
                      <>
                        <span aria-hidden className="flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-4 text-white">
                          {unread > 9 ? '9+' : unread}
                        </span>
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
