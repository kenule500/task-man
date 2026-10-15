import { useCallback, useEffect, useState } from 'react';
import { getApiErrorMessage } from '@/utils/api';
import { twoFactorApi } from '../api';
import type { TwoFactorStatus } from '../types';

interface Loaded {
  attempt: number;
  status: TwoFactorStatus | null;
  error: string;
}

/** Whether the signed-in user has two-factor authentication on. `reload` refetches after a change. */
export const useTwoFactorStatus = () => {
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    let cancelled = false;
    twoFactorApi.status()
      .then(status => { if (!cancelled) setLoaded({ attempt, status, error: '' }); })
      .catch(err => {
        if (!cancelled) setLoaded({ attempt, status: null, error: getApiErrorMessage(err, 'Could not load your two-factor settings.') });
      });
    return () => { cancelled = true; };
  }, [attempt]);

  const reload = useCallback(() => setAttempt(value => value + 1), []);

  return {
    status: loaded?.status ?? null,
    error: loaded?.error ?? '',
    // Keep showing the last known state while a reload runs
    loading: loaded === null,
    reload,
  };
};
