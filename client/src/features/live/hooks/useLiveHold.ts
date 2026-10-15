import { useEffect } from 'react';
import { holdLive } from '../lib/liveStore';

/**
 * While `active`, live refreshes wait (a drag is in progress, a form has unsaved edits). What arrived meanwhile
 * shows as the "N new changes" pill and is applied when the hold ends or the user presses it.
 */
export const useLiveHold = (active: boolean): void => {
  useEffect(() => {
    if (!active) return;
    return holdLive();
  }, [active]);
};
