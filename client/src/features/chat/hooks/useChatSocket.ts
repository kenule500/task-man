import { useEffect, useSyncExternalStore } from 'react';
import { chatClient, type ChatState } from '../lib/chatClient';

/** The shared chat state (channels, unread counts, online people, connection status). */
export const useChatState = (): ChatState => useSyncExternalStore(chatClient.subscribe, chatClient.getState, chatClient.getState);

/** Total unread messages, for the sidebar badge. */
export const useChatUnread = (): number => useChatState().unreadTotal;

/**
 * Opens the workspace's chat connection for as long as the caller is mounted (the workspace layout).
 * One connection per signed-in session; leaving the workspace or signing out closes it.
 */
export const useChatSocket = (slug: string | undefined, selfId: string | undefined, enabled: boolean): void => {
  useEffect(() => {
    if (!enabled || !slug || !selfId) return undefined;
    chatClient.start(slug, selfId);
    return () => chatClient.stop();
  }, [slug, selfId, enabled]);
};
