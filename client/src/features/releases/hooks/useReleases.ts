import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { fetchCached, getCached, setCached, subscribe } from '@/lib/queryCache';
import { getApiErrorMessage } from '@/utils/api';
import { releasesApi } from '../api';
import type { MoveOpenTo, Release, ReleaseInput, ReleasePatch } from '../types';

const releasesKey = (slug: string): string => `releases:${slug}`;
const NONE: Release[] = [];
const noop = () => undefined;

/**
 * Releases of a workspace (every project) with their progress, shared through the query cache so the
 * Releases tab, the task form and the task details show the same list. Mutations resolve with the saved
 * value and reject with a readable message; they refresh the list afterwards.
 */
export const useReleases = (slug: string | undefined, enabled = true) => {
  const key = slug && enabled ? releasesKey(slug) : '';
  const cached = useSyncExternalStore(
    callback => (key ? subscribe(key, callback) : noop),
    () => (key ? getCached<Release[]>(key) : undefined),
  );
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);

  useEffect(() => {
    if (!slug || !key) return;
    let cancelled = false;
    fetchCached(key, () => releasesApi.list(slug))
      .then(list => {
        setCached(key, list);
        if (!cancelled) setFailure(null);
      })
      .catch(err => {
        if (!cancelled) setFailure({ key, message: getApiErrorMessage(err, 'Could not load releases') });
      });
    return () => { cancelled = true; };
  }, [key, slug]);

  const refresh = useCallback(async () => {
    if (!slug) return;
    setCached(releasesKey(slug), await fetchCached(releasesKey(slug), () => releasesApi.list(slug), true));
  }, [slug]);

  /** Runs a mutation, refreshes the list and turns failures into readable errors. */
  const mutate = useCallback(async <T,>(run: (workspace: string) => Promise<T>, fallback: string): Promise<T> => {
    if (!slug) throw new Error(fallback);
    let result: T;
    try {
      result = await run(slug);
    } catch (err) {
      throw new Error(getApiErrorMessage(err, fallback), { cause: err });
    }
    await refresh().catch(() => undefined);
    return result;
  }, [slug, refresh]);

  const create = useCallback((input: ReleaseInput) => mutate(workspace => releasesApi.create(workspace, input), 'Could not create the release.'), [mutate]);
  const update = useCallback((id: string, patch: ReleasePatch) => mutate(workspace => releasesApi.update(workspace, id, patch), 'Could not save the release.'), [mutate]);
  const remove = useCallback((id: string) => mutate(workspace => releasesApi.remove(workspace, id), 'Could not delete the release.'), [mutate]);
  const release = useCallback(
    (id: string, moveOpenTo?: MoveOpenTo) => mutate(workspace => releasesApi.release(workspace, id, moveOpenTo), 'Could not release.'),
    [mutate],
  );

  return {
    releases: cached ?? NONE,
    loading: Boolean(key) && cached === undefined && failure?.key !== key,
    error: failure?.key === key ? failure.message : '',
    reload: refresh,
    create,
    update,
    remove,
    release,
  };
};
