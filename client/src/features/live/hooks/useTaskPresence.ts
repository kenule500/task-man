import { useEffect, useState } from 'react';
import { getToken } from '@/utils/session';
import { liveApi } from '../api';
import type { Viewer } from '../types';

export const PRESENCE_INTERVAL_MS = 20_000;

/**
 * Tells the server this person has the task open (every 20 s) and returns the other people who have it open.
 * Best effort: failures are ignored, and nothing runs while the tab is hidden.
 */
export const useTaskPresence = (slug: string | undefined, taskId: string | undefined, enabled = true): Viewer[] => {
  const [viewers, setViewers] = useState<Viewer[]>([]);

  useEffect(() => {
    if (!slug || !taskId || !enabled || !getToken()) return;
    let cancelled = false;

    const beat = async () => {
      if (document.hidden) return;
      try {
        await liveApi.heartbeat(slug, taskId);
        const others = await liveApi.viewers(slug, taskId);
        if (!cancelled) setViewers(others);
      } catch {
        // Presence is a nicety
      }
    };

    void beat();
    const timer = setInterval(() => { void beat(); }, PRESENCE_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
      setViewers([]);
      void liveApi.leave(slug, taskId).catch(() => undefined);
    };
  }, [slug, taskId, enabled]);

  return viewers;
};
