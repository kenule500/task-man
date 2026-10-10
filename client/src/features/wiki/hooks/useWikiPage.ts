import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { getApiErrorMessage } from '@/utils/api';
import { wikiApi } from '../api';
import type { WikiPage } from '../types';

interface Loaded {
  key: string;
  page: WikiPage | null;
  error: string;
  notFound: boolean;
}

/** One page with its Markdown and the tasks it mentions; `setPage` keeps the copy fresh after a save. */
export const useWikiPage = (slug: string | undefined, pageId: string | undefined) => {
  const key = slug && pageId ? `${slug}/${pageId}` : '';
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!slug || !pageId) return;
    let cancelled = false;
    wikiApi.get(slug, pageId)
      .then(page => { if (!cancelled) setLoaded({ key, page, error: '', notFound: false }); })
      .catch(err => {
        if (cancelled) return;
        const notFound = axios.isAxiosError(err) && err.response?.status === 404;
        setLoaded({ key, page: null, notFound, error: notFound ? '' : getApiErrorMessage(err, 'We could not load this page. Check your connection and try again.') });
      });
    return () => { cancelled = true; };
  }, [key, slug, pageId, version]);

  const setPage = useCallback((page: WikiPage) => {
    setLoaded({ key: `${slug}/${page._id}`, page, error: '', notFound: false });
  }, [slug]);

  const reload = useCallback(() => setVersion(current => current + 1), []);
  const current = loaded?.key === key ? loaded : null;
  return {
    page: current?.page ?? null,
    error: current?.error ?? '',
    notFound: current?.notFound ?? false,
    loading: Boolean(key) && !current,
    setPage,
    reload,
  };
};
