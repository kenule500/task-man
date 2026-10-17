import { useCallback, useEffect, useState } from 'react';
import { aiPlanApi } from '../api';
import type { AiPlan } from '../types';

/** The person's latest plans that can still be opened: ready for review, or still being generated. */
export const useRecentPlans = (slug: string | undefined, enabled = true) => {
  const [plans, setPlans] = useState<AiPlan[]>([]);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!slug || !enabled) return;
    let cancelled = false;
    aiPlanApi.list(slug)
      .then(items => {
        if (!cancelled) setPlans(items.filter(item => item.status === 'ready' || item.status === 'queued' || item.status === 'running'));
      })
      // The list is a convenience: a failure just means no shortcuts
      .catch(() => { if (!cancelled) setPlans([]); });
    return () => { cancelled = true; };
  }, [slug, enabled, attempt]);

  const reload = useCallback(() => setAttempt(current => current + 1), []);
  return { plans, reload };
};
