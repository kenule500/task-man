import { useCallback, useEffect, useState } from 'react';
import { getApiErrorMessage } from '@/utils/api';
import { auditApi } from '../api';
import type { AuditFilters, AuditPage } from '../types';

const NO_CURSORS: string[] = [];

interface Loaded {
  key: string;
  page: AuditPage | null;
  error: string;
}

/**
 * One page of the audit log with cursor navigation. "Older" pushes the page's `nextBefore` cursor on a stack,
 * "Newer" pops it, so going back never needs a new cursor. Changing the filters returns to the newest page.
 */
export const useAuditLog = (slug: string | undefined, filters: AuditFilters) => {
  const { area, actor } = filters;
  const filterKey = `${slug}|${area}|${actor}`;
  const [nav, setNav] = useState<{ filterKey: string; stack: string[] }>({ filterKey, stack: [] });
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  const stack = nav.filterKey === filterKey ? nav.stack : NO_CURSORS;
  const cursor = stack[stack.length - 1];
  const requestKey = `${filterKey}|${cursor ?? ''}|${attempt}`;

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    auditApi.list(slug, { area, actor }, cursor)
      .then(page => { if (!cancelled) setLoaded({ key: requestKey, page, error: '' }); })
      .catch(error => {
        if (!cancelled) setLoaded({ key: requestKey, page: null, error: getApiErrorMessage(error, 'We could not load the audit log.') });
      });
    return () => { cancelled = true; };
  }, [slug, area, actor, cursor, requestKey]);

  const current = loaded?.key === requestKey ? loaded : null;
  const page = current?.page ?? null;

  const older = useCallback(() => {
    if (page?.nextBefore) setNav({ filterKey, stack: [...stack, page.nextBefore] });
  }, [page, filterKey, stack]);
  const newer = useCallback(() => setNav({ filterKey, stack: stack.slice(0, -1) }), [filterKey, stack]);
  const retry = useCallback(() => setAttempt(value => value + 1), []);

  return {
    page,
    loading: Boolean(slug) && !current,
    error: current?.error ?? '',
    hasNewer: stack.length > 0,
    hasOlder: Boolean(page?.nextBefore),
    older,
    newer,
    retry,
  };
};
