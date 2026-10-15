import { useEffect, useState } from 'react';
import { getApiErrorMessage, tasksApi, type TaskActivityEntry } from '../api';

const PAGE_SIZE = 20;

interface Loaded {
  scope: string;
  /** Request this state answers (scope + refresh key + retry counter). */
  key: string;
  items: TaskActivityEntry[];
  nextBefore: string | null;
  error: string | null;
}

interface Options {
  /** Fetches only while true (the Activity tab is open). */
  enabled: boolean;
  /** Change it to refetch the newest entries (e.g. the task's `updatedAt`). */
  refreshKey?: string;
}

const byNewest = (a: TaskActivityEntry, b: TaskActivityEntry) =>
  b.createdAt.localeCompare(a.createdAt) || b._id.localeCompare(a._id);

/**
 * History of one task, newest first. Lazy: nothing is requested until `enabled`. A refresh keeps
 * the entries already on screen (including older pages) and adds the new ones on top.
 */
export const useTaskActivity = (slug: string | undefined, taskId: string, { enabled, refreshKey = '' }: Options) => {
  const scope = `${slug ?? ''}:${taskId}`;
  const [state, setState] = useState<Loaded | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  const key = `${scope}:${refreshKey}:${attempt}`;

  useEffect(() => {
    if (!enabled || !slug) return;
    let cancelled = false;
    tasksApi.activity(slug, taskId, { limit: PAGE_SIZE })
      .then(page => {
        if (cancelled) return;
        setState(prev => {
          const previous = prev && prev.scope === scope && !prev.error ? prev : null;
          if (!previous) return { scope, key, items: page.items, nextBefore: page.nextBefore, error: null };
          const fresh = new Set(page.items.map(item => item._id));
          const older = previous.items.filter(item => !fresh.has(item._id));
          const items = [...page.items, ...older].sort(byNewest);
          // Older pages were already loaded: keep their cursor
          const nextBefore = previous.items.length > page.items.length ? previous.nextBefore : page.nextBefore;
          return { scope, key, items, nextBefore, error: null };
        });
        setMoreError(null);
      })
      .catch(err => {
        if (cancelled) return;
        setState(prev => ({
          scope,
          key,
          items: prev && prev.scope === scope ? prev.items : [],
          nextBefore: prev && prev.scope === scope ? prev.nextBefore : null,
          error: getApiErrorMessage(err, 'Could not load the activity.'),
        }));
      });
    return () => { cancelled = true; };
  }, [enabled, slug, taskId, scope, key]);

  const current = state && state.scope === scope ? state : null;
  const loading = enabled && (current === null || (current.key !== key && current.error !== null));

  const loadMore = async () => {
    if (!slug || !current?.nextBefore || loadingMore) return;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const page = await tasksApi.activity(slug, taskId, { before: current.nextBefore, limit: PAGE_SIZE });
      setState(prev => {
        if (!prev || prev.scope !== scope) return prev;
        const known = new Set(prev.items.map(item => item._id));
        return { ...prev, items: [...prev.items, ...page.items.filter(item => !known.has(item._id))], nextBefore: page.nextBefore };
      });
    } catch (err) {
      setMoreError(getApiErrorMessage(err, 'Could not load older activity.'));
    } finally {
      setLoadingMore(false);
    }
  };

  const retry = () => setAttempt(value => value + 1);

  return {
    items: current?.items ?? [],
    nextBefore: current?.nextBefore ?? null,
    loading,
    /** Failed load; with entries on screen it came from a background refresh. */
    error: current?.error ?? null,
    loadingMore,
    moreError,
    loadMore,
    retry,
  };
};
