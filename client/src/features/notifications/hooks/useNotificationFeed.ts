import { useCallback, useEffect, useRef, useState } from 'react';
import { notificationsApi } from '../api';
import type { AppNotification } from '../types';

export const POLL_INTERVAL_MS = 60_000;
export const BELL_LIMIT = 10;

const CHANGED_EVENT = 'taskman:notifications-changed';

/** Tells every mounted notification list (bell, inbox) that something was read, so they refetch. */
export const announceNotificationsChanged = (source: unknown) =>
  window.dispatchEvent(new CustomEvent(CHANGED_EVENT, { detail: source }));

/** Runs `refresh` when another list changed notifications. */
export const useNotificationsChanged = (self: unknown, refresh: () => void) => {
  const latest = useRef(refresh);
  useEffect(() => { latest.current = refresh; }, [refresh]);
  useEffect(() => {
    const onChanged = (event: Event) => {
      if ((event as CustomEvent).detail !== self) latest.current();
    };
    window.addEventListener(CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(CHANGED_EVENT, onChanged);
  }, [self]);
};

/**
 * The latest notifications and the unread total for the bell. Polls every minute while the tab is
 * visible and refetches when the window regains focus.
 */
export const useNotificationFeed = (enabled = true) => {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState(false);
  const [self] = useState(() => ({}));
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const page = await notificationsApi.list({ limit: BELL_LIMIT });
      if (!mounted.current) return;
      setItems(page.items);
      setUnreadCount(page.unreadCount);
      setError(false);
    } catch {
      if (mounted.current) setError(true);
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    if (!enabled) return;
    // Fetching on mount is the point of this effect
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();

    const tick = () => { if (!document.hidden) void refresh(); };
    const timer = window.setInterval(tick, POLL_INTERVAL_MS);
    const onVisible = () => { if (!document.hidden) void refresh(); };
    window.addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled, refresh]);

  useNotificationsChanged(self, () => { void refresh(); });

  const markRead = useCallback(async (id: string) => {
    const target = items.find(item => item._id === id);
    if (!target || target.readAt) return;
    // Optimistic: the dot and the badge update at once; a failure refetches the truth
    setItems(current => current.map(item => (item._id === id ? { ...item, readAt: new Date().toISOString() } : item)));
    setUnreadCount(count => Math.max(0, count - 1));
    try {
      const result = await notificationsApi.markRead(id);
      if (mounted.current) setUnreadCount(result.unreadCount);
      announceNotificationsChanged(self);
    } catch {
      void refresh();
    }
  }, [items, refresh, self]);

  const markAllRead = useCallback(async () => {
    const now = new Date().toISOString();
    setItems(current => current.map(item => (item.readAt ? item : { ...item, readAt: now })));
    setUnreadCount(0);
    try {
      await notificationsApi.markAllRead();
      announceNotificationsChanged(self);
    } catch {
      void refresh();
    }
  }, [refresh, self]);

  return { items, unreadCount, loading, error, refresh, markRead, markAllRead };
};
