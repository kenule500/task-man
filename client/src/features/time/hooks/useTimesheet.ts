import { useEffect, useState } from 'react';
import { getApiErrorMessage, timeApi, type TimesheetQuery } from '../api';
import { TIME_CHANGED_EVENT } from '../timerStore';
import type { Timesheet } from '../types';

interface Loaded {
  key: string;
  data: Timesheet | null;
  error: string | null;
}

/**
 * The workspace timesheet for a date range (and optionally one person). Keeps the previous data on screen while a
 * refresh runs; reloads after any time change made in this tab.
 */
export const useTimesheet = (slug: string | undefined, query: TimesheetQuery) => {
  const { from, to, user, project } = query;
  const key = `${slug ?? ''}|${from ?? ''}|${to ?? ''}|${user ?? ''}|${project ?? ''}`;
  const [state, setState] = useState<Loaded | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!slug) return;
    let controller = new AbortController();
    const load = () => {
      controller.abort();
      controller = new AbortController();
      const { signal } = controller;
      timeApi.timesheet(slug, { from, to, user, project }, signal)
        .then(data => { if (!signal.aborted) setState({ key, data, error: null }); })
        .catch(err => {
          if (signal.aborted) return;
          setState(prev => ({
            key,
            data: prev && prev.key === key ? prev.data : null,
            error: getApiErrorMessage(err, 'Could not load the timesheet.'),
          }));
        });
    };
    load();
    window.addEventListener(TIME_CHANGED_EVENT, load);
    return () => {
      controller.abort();
      window.removeEventListener(TIME_CHANGED_EVENT, load);
    };
  }, [slug, key, from, to, user, project, attempt]);

  const current = state && state.key === key ? state : null;
  return {
    data: current?.data ?? null,
    loading: Boolean(slug) && current === null,
    error: current?.error ?? null,
    retry: () => setAttempt(value => value + 1),
  };
};
