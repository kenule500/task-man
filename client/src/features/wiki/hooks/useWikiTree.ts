import { useCallback, useEffect, useState } from 'react';
import { getApiErrorMessage } from '@/utils/api';
import { wikiApi } from '../api';
import type { WikiPageSummary } from '../types';

interface Loaded {
  key: string;
  pages: WikiPageSummary[];
  error: string;
}

/** The page tree (titles only) of the workspace wiki, or of one project's wiki when `project` is a project name. */
export const useWikiTree = (slug: string | undefined, project: string) => {
  const key = slug ? `${slug}|${project}` : '';
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    wikiApi.list(slug, project)
      .then(pages => { if (!cancelled) setLoaded({ key, pages, error: '' }); })
      .catch(err => {
        if (!cancelled) setLoaded({ key, pages: [], error: getApiErrorMessage(err, 'We could not load the pages. Check your connection and try again.') });
      });
    return () => { cancelled = true; };
  }, [key, slug, project, version]);

  /** Replaces the list with the result of a change (the API answers moves with the whole tree). */
  const setPages = useCallback((update: (pages: WikiPageSummary[]) => WikiPageSummary[]) => {
    setLoaded(previous => (previous && previous.key === key ? { ...previous, pages: update(previous.pages) } : previous));
  }, [key]);

  const reload = useCallback(() => setVersion(current => current + 1), []);
  const current = loaded?.key === key ? loaded : null;
  return {
    pages: current?.pages ?? [],
    error: current?.error ?? '',
    loading: Boolean(key) && !current,
    setPages,
    reload,
  };
};
