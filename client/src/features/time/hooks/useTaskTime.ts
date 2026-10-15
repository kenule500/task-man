import { useCallback, useEffect, useState } from 'react';
import { getApiErrorMessage, timeApi } from '../api';
import { TIME_CHANGED_EVENT, notifyTimeChanged } from '../timerStore';
import type { LogTimeInput, TaskTime } from '../types';

interface Loaded {
  scope: string;
  data: TaskTime | null;
  error: string | null;
}

/**
 * Time entries of one task, loaded when the dialog opens and reloaded after every change
 * (also changes made elsewhere in this tab, such as the header timer).
 */
export const useTaskTime = (slug: string | undefined, taskId: string) => {
  const scope = `${slug ?? ''}:${taskId}`;
  const [state, setState] = useState<Loaded | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    const load = () => {
      timeApi.forTask(slug, taskId)
        .then(data => { if (!cancelled) setState({ scope, data, error: null }); })
        .catch(err => {
          if (cancelled) return;
          setState(prev => ({
            scope,
            data: prev && prev.scope === scope ? prev.data : null,
            error: getApiErrorMessage(err, 'Could not load the time entries.'),
          }));
        });
    };
    load();
    window.addEventListener(TIME_CHANGED_EVENT, load);
    return () => {
      cancelled = true;
      window.removeEventListener(TIME_CHANGED_EVENT, load);
    };
  }, [slug, taskId, scope, attempt]);

  const current = state && state.scope === scope ? state : null;

  const log = useCallback(async (input: LogTimeInput) => {
    if (!slug) return;
    await timeApi.log(slug, taskId, input);
    notifyTimeChanged();
  }, [slug, taskId]);

  const remove = useCallback(async (entryId: string) => {
    if (!slug) return;
    await timeApi.remove(slug, taskId, entryId);
    notifyTimeChanged();
  }, [slug, taskId]);

  return {
    data: current?.data ?? null,
    loading: Boolean(slug) && current === null,
    error: current?.error ?? null,
    retry: () => setAttempt(value => value + 1),
    log,
    remove,
  };
};
