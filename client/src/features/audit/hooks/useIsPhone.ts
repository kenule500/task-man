import { useSyncExternalStore } from 'react';

const QUERY = '(max-width: 767px)';

const hasMatchMedia = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function';

const subscribe = (onChange: () => void) => {
  if (!hasMatchMedia()) return () => undefined;
  const media = window.matchMedia(QUERY);
  media.addEventListener?.('change', onChange);
  return () => media.removeEventListener?.('change', onChange);
};

const snapshot = () => hasMatchMedia() && window.matchMedia(QUERY).matches;

/** True below the `md` breakpoint (phones): the audit log becomes a grouped list with a bottom sheet. */
export const useIsPhone = (): boolean => useSyncExternalStore(subscribe, snapshot, () => false);
