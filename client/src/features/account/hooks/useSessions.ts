import { useCallback, useEffect, useState } from 'react';
import { getApiErrorMessage } from '@/utils/api';
import { sessionsApi } from '../api';
import type { AccountSession } from '../types';

interface Loaded {
  attempt: number;
  sessions: AccountSession[];
  error: string;
}

/** Signed-in devices of the current user. `revoke*` reject on failure so callers can toast. */
export const useSessions = () => {
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    let cancelled = false;
    sessionsApi.list()
      .then(sessions => { if (!cancelled) setLoaded({ attempt, sessions, error: '' }); })
      .catch(err => {
        if (!cancelled) setLoaded({ attempt, sessions: [], error: getApiErrorMessage(err, 'Could not load your signed-in devices.') });
      });
    return () => { cancelled = true; };
  }, [attempt]);

  const current = loaded?.attempt === attempt ? loaded : null;
  const sessions = loaded?.sessions ?? [];

  const reload = useCallback(() => setAttempt(value => value + 1), []);

  const revoke = useCallback(async (id: string) => {
    await sessionsApi.revoke(id);
    setLoaded(state => state && { ...state, sessions: state.sessions.filter(session => session._id !== id) });
  }, []);

  const revokeOthers = useCallback(async () => {
    const revoked = await sessionsApi.revokeOthers();
    setLoaded(state => state && { ...state, sessions: state.sessions.filter(session => session.current) });
    return revoked;
  }, []);

  return { sessions, loading: current === null, error: current?.error ?? '', reload, revoke, revokeOthers };
};
