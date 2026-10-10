import { useEffect, useState, useSyncExternalStore } from 'react';
import { getTimerSnapshot, refreshTimer, selectWorkspace, subscribeTimer } from '../timerStore';

/** Ticks once a second while `active`, returning the current time in milliseconds. */
export const useNow = (active: boolean): number => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const tick = () => setNow(Date.now());
    const id = window.setInterval(tick, 1000);
    // Catch up at once when the tab becomes visible again (timers sleep in background tabs)
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [active]);
  return now;
};

/**
 * The caller's running timer in a workspace, shared by the header pill and the task dialog.
 * Reloads when the window regains focus; start and stop go through `timerStore`, which updates it at once.
 */
export const useRunningTimer = (slug: string | undefined, enabled = true) => {
  const state = useSyncExternalStore(subscribeTimer, getTimerSnapshot);
  const active = Boolean(slug) && enabled;

  useEffect(() => {
    if (!slug || !enabled) return;
    selectWorkspace(slug);
    void refreshTimer(slug);
    const refresh = () => { void refreshTimer(slug); };
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [slug, enabled]);

  const current = active && state.slug === slug ? state : null;
  return { timer: current?.timer ?? null, loaded: current?.loaded ?? false };
};
