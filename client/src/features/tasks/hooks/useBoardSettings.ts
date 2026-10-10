import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useSearchParams } from 'react-router-dom';
import api, { getApiErrorMessage } from '@/utils/api';
import { TASK_STATUSES } from '../constants';
import { parseQuickFilters, serializeQuickFilters, type QuickFilterKey } from '../lib/boardQuickFilters';
import { parseSwimlaneGroup, type SwimlaneGroup } from '../lib/swimlanes';
import { NO_WIP_LIMITS, normalizeWipLimits, type WipLimits } from '../lib/wip';
import type { TaskStatus } from '../types';

const boardSettingsUrl = (slug: string) => `/workspaces/${encodeURIComponent(slug)}/board-settings`;

/**
 * Board settings of a workspace (today: soft WIP limits per column).
 * A missing endpoint (404) or any read failure simply means "no limits".
 */
export const useBoardSettings = (slug: string | undefined) => {
  const [loaded, setLoaded] = useState<{ slug: string; limits: WipLimits } | null>(null);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    api.get(boardSettingsUrl(slug))
      .then(({ data }) => { if (!cancelled) setLoaded({ slug, limits: normalizeWipLimits(data) }); })
      .catch(() => { if (!cancelled) setLoaded({ slug, limits: NO_WIP_LIMITS }); });
    return () => { cancelled = true; };
  }, [slug]);

  const limits = loaded && loaded.slug === slug ? loaded.limits : NO_WIP_LIMITS;

  /** Saves every limit (needs `settings:manage`). Resolves to an error message, or `null` on success. */
  const saveLimits = useCallback(async (next: WipLimits): Promise<string | null> => {
    if (!slug) return 'No workspace selected';
    try {
      const { data } = await api.put(boardSettingsUrl(slug), { wipLimits: next });
      setLoaded({ slug, limits: data && typeof data === 'object' ? normalizeWipLimits(data) : next });
      return null;
    } catch (error) {
      return getApiErrorMessage(error, 'Could not save the WIP limits');
    }
  }, [slug]);

  return { limits, saveLimits, loading: Boolean(slug) && loaded?.slug !== slug };
};

export interface BoardUrlState {
  /** Column shown on phones; `?col=in-progress` (Pending when absent). */
  column: TaskStatus;
  setColumn: (status: TaskStatus) => void;
  /** `?qf=mine,bugs` */
  quickFilters: QuickFilterKey[];
  setQuickFilters: (keys: QuickFilterKey[]) => void;
  /** `?group=assignee` */
  groupBy: SwimlaneGroup;
  setGroupBy: (group: SwimlaneGroup) => void;
}

/**
 * Board UI state kept in the URL. Changing the phone column pushes a history entry (so Back goes
 * to the previous column); filters and grouping replace the entry.
 */
export const useBoardUrlState = (): BoardUrlState => {
  const [params, setParams] = useSearchParams();
  const colParam = params.get('col');
  const qfParam = params.get('qf');
  const groupParam = params.get('group');

  const column = TASK_STATUSES.find(status => status === colParam) ?? TASK_STATUSES[0];
  const quickFilters = useMemo(() => parseQuickFilters(qfParam), [qfParam]);
  const groupBy = parseSwimlaneGroup(groupParam);

  const write = useCallback((name: string, value: string | null, replace: boolean) => {
    setParams(prev => {
      const next = new URLSearchParams(prev);
      if (value) next.set(name, value);
      else next.delete(name);
      return next;
    }, { replace });
  }, [setParams]);

  return {
    column,
    setColumn: status => write('col', status === TASK_STATUSES[0] ? null : status, false),
    quickFilters,
    setQuickFilters: keys => write('qf', serializeQuickFilters(keys) || null, true),
    groupBy,
    setGroupBy: group => write('group', group === 'none' ? null : group, true),
  };
};

const DESKTOP_QUERY = '(min-width: 768px)';

const subscribeDesktop = (notify: () => void) => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => undefined;
  const query = window.matchMedia(DESKTOP_QUERY);
  query?.addEventListener?.('change', notify);
  return () => query?.removeEventListener?.('change', notify);
};

const desktopSnapshot = () =>
  typeof window === 'undefined' || typeof window.matchMedia !== 'function'
    ? true
    : (window.matchMedia(DESKTOP_QUERY)?.matches ?? true);

/** True from the `md` breakpoint up; assumes desktop where matchMedia is missing (jsdom). */
export const useIsDesktop = (): boolean => useSyncExternalStore(subscribeDesktop, desktopSnapshot, () => true);
