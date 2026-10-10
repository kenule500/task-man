import { useEffect, useState } from 'react';
import { getApiErrorMessage } from '@/utils/api';
import { planningApi } from '../api';
import type { SprintReport } from '../lib/sprintReport';

interface Loaded {
  key: string;
  report: SprintReport | null;
  error: string;
}

/** Loads the report of one sprint; `loading` is true until the answer for the current ids arrived. */
export const useSprintReport = (slug: string | undefined, projectId: string | undefined, sprintId: string | undefined) => {
  const key = slug && projectId && sprintId ? `${slug}/${projectId}/${sprintId}` : '';
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    if (!slug || !projectId || !sprintId) return;
    let cancelled = false;
    planningApi.sprintReport(slug, projectId, sprintId)
      .then(report => { if (!cancelled) setLoaded({ key, report, error: '' }); })
      .catch(err => {
        if (!cancelled) setLoaded({ key, report: null, error: getApiErrorMessage(err, 'Could not load the sprint report') });
      });
    return () => { cancelled = true; };
  }, [key, slug, projectId, sprintId]);

  const current = loaded?.key === key ? loaded : null;
  return { report: current?.report ?? null, error: current?.error ?? '', loading: Boolean(key) && !current };
};
