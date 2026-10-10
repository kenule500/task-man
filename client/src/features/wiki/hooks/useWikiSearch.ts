import { useEffect, useState } from 'react';
import { getApiErrorMessage } from '@/utils/api';
import { wikiApi } from '../api';
import type { WikiSearchHit } from '../types';

export const MIN_SEARCH_LENGTH = 2;
const DEBOUNCE_MS = 250;

interface Loaded {
  query: string;
  hits: WikiSearchHit[];
  error: string;
}

/** Searches page titles and text across the whole workspace wiki once the person pauses typing. */
export const useWikiSearch = (slug: string | undefined, rawQuery: string) => {
  const query = rawQuery.trim();
  const active = Boolean(slug) && query.length >= MIN_SEARCH_LENGTH;
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    if (!slug || !active) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      wikiApi.search(slug, query)
        .then(hits => { if (!cancelled) setLoaded({ query, hits, error: '' }); })
        .catch(err => {
          if (!cancelled) setLoaded({ query, hits: [], error: getApiErrorMessage(err, 'We could not search the pages. Try again.') });
        });
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [slug, query, active]);

  const current = active && loaded?.query === query ? loaded : null;
  return {
    active,
    hits: current?.hits ?? [],
    error: current?.error ?? '',
    searching: active && !current,
  };
};
