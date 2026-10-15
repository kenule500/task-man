import { useEffect, useRef } from 'react';
import { planRefresh } from '../lib/merge';
import { subscribeApply } from '../lib/liveStore';

export const LIVE_REFRESH_DEBOUNCE_MS = 600;

/**
 * Runs `refresh` (once, debounced) when other people changed data of `area` in workspace `slug`.
 * Held batches (drag, unsaved form) arrive later, from the store, so this never needs to check for holds.
 * `refresh` should return `true` when it could not run now (the cache has unsaved local changes) to be retried.
 */
export const useLiveRefresh = (
  slug: string | undefined,
  area: 'tasks' | 'projects',
  refresh: () => void | boolean | Promise<void | boolean>,
): void => {
  const latest = useRef(refresh);
  useEffect(() => {
    latest.current = refresh;
  }, [refresh]);

  useEffect(() => {
    if (!slug) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;

    const run = async () => {
      timer = undefined;
      const retry = await latest.current();
      if (retry === true && !cancelled) timer = setTimeout(() => { void run(); }, LIVE_REFRESH_DEBOUNCE_MS * 2);
    };

    const stop = subscribeApply(batch => {
      if (batch.slug !== slug || !planRefresh(batch)[area]) return;
      // Several batches inside the window cost one request
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(() => { void run(); }, LIVE_REFRESH_DEBOUNCE_MS);
    });
    return () => {
      cancelled = true;
      stop();
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [slug, area]);
};
