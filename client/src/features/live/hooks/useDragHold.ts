import { useEffect } from 'react';
import { holdLive } from '../lib/liveStore';

/** A drag that never reports its end (the dragged element left the page) must not block refreshes forever. */
export const MAX_DRAG_HOLD_MS = 30_000;

/**
 * Holds live refreshes while any native drag and drop is in progress (board cards, calendar chips):
 * a refetch in the middle of a drag would swap the cards under the pointer.
 */
export const useDragHold = (): void => {
  useEffect(() => {
    let release: (() => void) | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const end = () => {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
      release?.();
      release = null;
    };
    const start = () => {
      if (release) return;
      release = holdLive();
      timer = setTimeout(end, MAX_DRAG_HOLD_MS);
    };

    window.addEventListener('dragstart', start, true);
    window.addEventListener('dragend', end, true);
    window.addEventListener('drop', end, true);
    return () => {
      window.removeEventListener('dragstart', start, true);
      window.removeEventListener('dragend', end, true);
      window.removeEventListener('drop', end, true);
      end();
    };
  }, []);
};
