import { useEffect, useReducer, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import {
  SidebarGroup, SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar,
} from '@/components/ui/sidebar';
import { usePermissions } from '@/hooks/usePermissions';
import { chatApi } from '../api';
import { onConversations } from '../lib/conversationEvents';
import { allLastRead, setLastRead } from '../lib/readState';
import { unreadCount } from '../lib/messages';
import type { ChatChannel } from '../types';

/**
 * The workspace-wide channel row of the sidebar's chat group.
 *
 * The group and the single `Project chat` destination belong to `Sidebar`; this list adds `General`,
 * the channel every member of the workspace with `chat:read` can see without joining a project
 * (AC-117, AC-118). Direct messages are deliberately not sidebar rows - they live in the conversation
 * list - and the seeded `team` channel is reached through `Project chat`.
 *
 * The chat screen announces a rename or a read through `conversationEvents`, so the sidebar never
 * needs its own socket and the two panes cannot disagree (AC-113).
 */
export const SidebarChannels = () => {
  const { workspaceSlug } = useParams<{ workspaceSlug: string }>();
  const { pathname } = useLocation();
  const { isMobile, setOpenMobile } = useSidebar();
  const { can, loading } = usePermissions();

  const [channels, setChannels] = useState<ChatChannel[]>([]);
  // A rename means the list itself changed; a read only means the rows must repaint
  const [reloads, setReloads] = useState(0);
  // A read does not change the list, only its badge, so it forces a repaint and nothing else
  const [, repaint] = useReducer((count: number) => count + 1, 0);

  const canRead = !loading && can('chat:read');
  // Visiting a conversation writes the read state; every render re-reads it, so a badge clears at once
  const readState = allLastRead();

  useEffect(() => {
    if (!workspaceSlug || !canRead) return undefined;
    let cancelled = false;
    chatApi.channels(workspaceSlug)
      .then(list => {
        if (cancelled) return;
        setChannels(list.filter(channel => !channel.archived));
      })
      .catch(() => {
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

  // General is the workspace-wide channel: no project membership is needed to read it (AC-118)
  const generalChannels = canRead && workspaceSlug
    ? channels.filter(channel => channel.kind === 'general')
    : [];

  if (!canRead || !workspaceSlug || generalChannels.length === 0) return null;

  const close = () => {
    if (isMobile) setOpenMobile(false);
  };

  return (
    <SidebarGroup data-testid="sidebar-chat">
      <SidebarMenu>
        {generalChannels.map(channel => {
          const href = `/${workspaceSlug}/chat/${channel._id}`;
          const active = pathname === href;
          // The member's own read state decides; the server flag only covers a channel this browser
          // has never opened, so a stale flag cannot re-light a cleared badge (AC-111, AC-118)
          const seen = readState[channel._id];
          const unread = seen ? unreadCount(channel, readState) : (channel.unread ? 1 : 0);
          const label = channel.name;

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
                      #
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
