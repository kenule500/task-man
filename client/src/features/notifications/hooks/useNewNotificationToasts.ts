import { useEffect, useRef } from 'react';
import { toast } from '@/components/ds';
import { notificationSentence } from '../lib/format';
import { emptySeen, findNewUnread, markSeen, MAX_NEW_TOASTS, type SeenNotifications } from '../lib/newItems';
import type { AppNotification } from '../types';

interface Options {
  /** False until the first successful fetch: the initial list never toasts. */
  loaded: boolean;
  /** Opens the notification (marks it read and navigates). */
  onOpen: (notification: AppNotification) => void;
  /** Opens the full inbox, for the "+N more" toast. */
  onOpenInbox?: () => void;
}

/**
 * Shows a toast for each unread notification that arrives while the page is open (at most
 * MAX_NEW_TOASTS, then one "+N more"). Skipped while the tab is hidden: the push notification
 * covers that case, and those items count as seen so they never toast later.
 */
export const useNewNotificationToasts = (items: AppNotification[], { loaded, onOpen, onOpenInbox }: Options) => {
  const seen = useRef<SeenNotifications | null>(null);
  const handlers = useRef({ onOpen, onOpenInbox });
  useEffect(() => { handlers.current = { onOpen, onOpenInbox }; }, [onOpen, onOpenInbox]);

  useEffect(() => {
    if (!loaded) return;
    // First list: remember it, announce nothing
    if (!seen.current) {
      seen.current = markSeen(emptySeen(), items);
      return;
    }
    const fresh = findNewUnread(seen.current, items);
    seen.current = markSeen(seen.current, items);
    if (fresh.length === 0 || document.hidden) return;

    fresh.slice(-MAX_NEW_TOASTS).forEach(notification => {
      toast({
        title: notificationSentence(notification),
        action: { label: 'Open', onClick: () => handlers.current.onOpen(notification) },
      });
    });
    const more = fresh.length - MAX_NEW_TOASTS;
    if (more > 0) {
      toast({
        title: `+${more} more ${more === 1 ? 'notification' : 'notifications'}`,
        action: handlers.current.onOpenInbox ? { label: 'View all', onClick: () => handlers.current.onOpenInbox?.() } : undefined,
      });
    }
  }, [items, loaded]);
};
