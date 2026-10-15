import { useCallback, useEffect, useState } from 'react';
import { getApiErrorMessage } from '@/utils/api';
import { releasesApi } from '../api';
import type { ReleaseDetail, ReleaseNotes } from '../types';

interface Loaded {
  key: string;
  release: ReleaseDetail | null;
  notes: ReleaseNotes | null;
  error: string;
}

/** Loads one release with its tasks and generated notes; `reload` fetches both again (after a change). */
export const useRelease = (slug: string | undefined, releaseId: string | undefined) => {
  const key = slug && releaseId ? `${slug}/${releaseId}` : '';
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!slug || !releaseId) return;
    let cancelled = false;
    Promise.all([releasesApi.get(slug, releaseId), releasesApi.notes(slug, releaseId)])
      .then(([release, notes]) => { if (!cancelled) setLoaded({ key, release, notes, error: '' }); })
      .catch(err => {
        if (!cancelled) setLoaded({ key, release: null, notes: null, error: getApiErrorMessage(err, 'Could not load the release') });
      });
    return () => { cancelled = true; };
  }, [key, slug, releaseId, version]);

  const reload = useCallback(() => setVersion(current => current + 1), []);
  const current = loaded?.key === key ? loaded : null;
  return {
    release: current?.release ?? null,
    notes: current?.notes ?? null,
    error: current?.error ?? '',
    loading: Boolean(key) && !current,
    reload,
  };
};
