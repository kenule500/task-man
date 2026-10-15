import { useEffect, useRef } from 'react';
import { announceNotificationsChanged } from '@/features/notifications/hooks/useNotificationFeed';
import { getToken } from '@/utils/session';
import { liveApi } from '../api';
import { setLiveState, publishBatch, resetLiveStore, subscribeIncoming } from '../lib/liveStore';
import { planRefresh, withoutOwn } from '../lib/merge';
import { createPoller } from '../lib/poller';

/** Identifies this hook's refreshes of the bell, so the bell does not refetch twice. */
const NOTIFICATION_SOURCE = { source: 'live-changes' };

/** Interaction events that count as "the user is here". */
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'touchstart', 'wheel', 'mousemove'] as const;
const ACTIVITY_THROTTLE_MS = 1000;

interface Options {
  /** False while permissions load or the role cannot read tasks. */
  enabled?: boolean;
  /** The signed-in person: their own changes are not echoed back to them. */
  selfId?: string;
}

/**
 * Polls the workspace change feed and hands other people's changes to the caches (see `liveStore`).
 * Mount it once, in the workspace layout. It polls every 10 s while the tab is visible and the user is
 * active, pauses after 2 minutes without interaction, polls at once on focus/online, backs off after
 * errors and stops on logout.
 */
export const useLiveChanges = (slug: string | undefined, { enabled = true, selfId }: Options = {}): void => {
  const selfRef = useRef(selfId);
  useEffect(() => {
    selfRef.current = selfId;
  }, [selfId]);

  useEffect(() => {
    if (!slug || !enabled) return;
    let cursor: string | null = null;

    const poller = createPoller({
      poll: async () => {
        if (!getToken()) {
          poller.stop();
          return;
        }
        const result = await liveApi.changes(slug, cursor);
        const first = cursor === null;
        cursor = result.cursor;
        // The first answer is only the starting point: what is on screen is already current
        if (first) return;
        const changes = withoutOwn(result.changes ?? [], selfRef.current);
        if (changes.length > 0 || result.reset) publishBatch({ slug, changes, reset: Boolean(result.reset) });
      },
      onState: setLiveState,
    });

    // The bell shows what others did to me (assignments, comments): refetch it as soon as such changes arrive
    const stopBell = subscribeIncoming(batch => {
      if (planRefresh(batch).notifications) announceNotificationsChanged(NOTIFICATION_SOURCE);
    });

    let lastActivity = 0;
    const onActivity = () => {
      const at = Date.now();
      if (at - lastActivity < ACTIVITY_THROTTLE_MS) return;
      lastActivity = at;
      poller.activity();
    };
    const onVisibility = () => poller.setVisible(!document.hidden);
    const onFocus = () => poller.pollNow();
    const onStorage = (event: StorageEvent) => {
      if (event.key === 'token' && !event.newValue) poller.stop();
    };

    for (const name of ACTIVITY_EVENTS) window.addEventListener(name, onActivity, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onFocus);
    window.addEventListener('storage', onStorage);

    poller.setVisible(!document.hidden);
    poller.start();

    return () => {
      poller.stop();
      stopBell();
      for (const name of ACTIVITY_EVENTS) window.removeEventListener(name, onActivity);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onFocus);
      window.removeEventListener('storage', onStorage);
      resetLiveStore();
    };
  }, [slug, enabled]);
};
