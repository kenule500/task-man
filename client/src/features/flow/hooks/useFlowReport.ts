import { useCallback, useEffect, useState } from 'react';
import { getApiErrorMessage } from '@/utils/api';
import { flowApi } from '../api';
import type { FlowReport } from '../types';

interface Loaded {
  key: string;
  report: FlowReport | null;
  error: string;
}

/** Loads the flow report for the filters; `loading` is true until the answer for the current filters arrived. */
export const useFlowReport = (
  slug: string | undefined,
  filters: { project?: string; sprint?: string; from: string; to: string },
) => {
  const { project = '', sprint = '', from, to } = filters;
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const key = slug ? `${slug}|${project}|${sprint}|${from}|${to}|${attempt}` : '';

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    flowApi.report(slug, { project, sprint, from, to })
      .then(report => { if (!cancelled) setLoaded({ key, report, error: '' }); })
      .catch(err => {
        if (!cancelled) setLoaded({ key, report: null, error: getApiErrorMessage(err, 'Could not load the flow report') });
      });
    return () => { cancelled = true; };
  }, [key, slug, project, sprint, from, to]);

  const retry = useCallback(() => setAttempt(value => value + 1), []);
  const current = loaded?.key === key ? loaded : null;
  return { report: current?.report ?? null, error: current?.error ?? '', loading: Boolean(key) && !current, retry };
};
