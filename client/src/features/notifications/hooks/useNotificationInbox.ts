import { useCallback, useEffect, useRef, useState } from 'react';
import { notificationsApi } from '../api';
import type { AppNotification, InboxFilter } from '../types';
import { announceNotificationsChanged, useNotificationsChanged } from './useNotificationFeed';

export const INBOX_PAGE_SIZE = 20;

/** The full notification list with an All/Unread filter and "Load older" cursor paging. */
export const useNotificationInbox = (filter: InboxFilter) => {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [self] = useState(() => ({}));
  // Responses of an older filter must not overwrite the current list
  const generation = useRef(0);

  const load = useCallback(async (silent = false) => {
    const mine = ++generation.current;
    if (!silent) setLoading(true);
    try {
      const page = await notificationsApi.list({ unread: filter === 'unread', limit: INBOX_PAGE_SIZE });
      if (mine !== generation.current) return;
      setItems(page.items);
      setNextBefore(page.nextBefore);
      setUnreadCount(page.unreadCount);
      setError(false);
    } catch {
      if (mine === generation.current) setError(true);
    } finally {
      if (mine === generation.current) setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    // Fetching on mount and when the filter changes is the point of this effect
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  useNotificationsChanged(self, () => { void load(true); });

  const loadMore = useCallback(async () => {
    if (!nextBefore || loadingMore) return;
    const mine = generation.current;
    setLoadingMore(true);
    try {
      const page = await notificationsApi.list({ unread: filter === 'unread', limit: INBOX_PAGE_SIZE, before: nextBefore });
      if (mine !== generation.current) return;
      setItems(current => {
        const seen = new Set(current.map(item => item._id));
        return [...current, ...page.items.filter(item => !seen.has(item._id))];
      });
      setNextBefore(page.nextBefore);
      setUnreadCount(page.unreadCount);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoadingMore(false);
    }
  }, [filter, loadingMore, nextBefore]);

  const markRead = useCallback(async (id: string) => {
    const target = items.find(item => item._id === id);
    if (!target || target.readAt) return;
    setItems(current => current.map(item => (item._id === id ? { ...item, readAt: new Date().toISOString() } : item)));
    setUnreadCount(count => Math.max(0, count - 1));
    try {
      const result = await notificationsApi.markRead(id);
      setUnreadCount(result.unreadCount);
      announceNotificationsChanged(self);
    } catch {
      void load(true);
    }
  }, [items, load, self]);

  const markAllRead = useCallback(async () => {
    const now = new Date().toISOString();
    setItems(current => current.map(item => (item.readAt ? item : { ...item, readAt: now })));
    setUnreadCount(0);
    try {
      await notificationsApi.markAllRead();
      announceNotificationsChanged(self);
    } catch {
      void load(true);
    }
  }, [load, self]);

  return { items, unreadCount, loading, loadingMore, error, hasMore: nextBefore !== null, loadMore, retry: load, markRead, markAllRead };
};
