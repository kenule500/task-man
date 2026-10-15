import type { AppNotification } from '../types';

/** Toasts shown at once; anything beyond collapses into a single "+N more" toast. */
export const MAX_NEW_TOASTS = 3;

export interface SeenNotifications {
  ids: Set<string>;
  /** Newest createdAt (ms) seen so far. */
  latest: number;
}

export const emptySeen = (): SeenNotifications => ({ ids: new Set(), latest: 0 });

const timeOf = (notification: AppNotification): number => {
  const time = Date.parse(notification.createdAt);
  return Number.isNaN(time) ? 0 : time;
};

/** Records `items` as seen. */
export const markSeen = (seen: SeenNotifications, items: AppNotification[]): SeenNotifications => ({
  ids: new Set([...seen.ids, ...items.map(item => item._id)]),
  latest: items.reduce((latest, item) => Math.max(latest, timeOf(item)), seen.latest),
});

/**
 * Unread notifications that appeared since `seen`, oldest first. Items that only slid into the
 * window (older than anything seen) or are already read are not new.
 */
export const findNewUnread = (seen: SeenNotifications, items: AppNotification[]): AppNotification[] =>
  items
    .filter(item => !item.readAt && !seen.ids.has(item._id) && timeOf(item) >= seen.latest)
    .sort((a, b) => timeOf(a) - timeOf(b));
