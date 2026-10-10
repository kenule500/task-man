import { useCallback, useEffect, useState } from 'react';
import { getApiErrorMessage } from '@/utils/api';
import { viewsApi } from '../api';
import type { SavedView, SavedViewInput, SavedViewPatch } from '../types';

/**
 * The saved views of a workspace (the user's own plus the shared ones). Pass `undefined` to stay idle.
 * Mutations resolve to an error message, or `null` on success, so a dialog can show the message and stay open.
 */
export const useSavedViews = (slug: string | undefined) => {
  const [loaded, setLoaded] = useState<{ slug: string; views: SavedView[]; failed: boolean } | null>(null);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    viewsApi.list(slug)
      .then(views => { if (!cancelled) setLoaded({ slug, views, failed: false }); })
      .catch(() => { if (!cancelled) setLoaded({ slug, views: [], failed: true }); });
    return () => { cancelled = true; };
  }, [slug]);

  const current = loaded && loaded.slug === slug ? loaded : null;
  const views = current?.views ?? [];

  const setViews = useCallback((update: (views: SavedView[]) => SavedView[]) => {
    setLoaded(prev => (prev && prev.slug === slug ? { ...prev, views: update(prev.views) } : prev));
  }, [slug]);

  const create = useCallback(async (input: SavedViewInput): Promise<string | null> => {
    if (!slug) return 'No workspace selected';
    try {
      const created = await viewsApi.create(slug, input);
      setViews(list => [...list, created]);
      return null;
    } catch (error) {
      return getApiErrorMessage(error, 'We could not save this view. Try again.');
    }
  }, [slug, setViews]);

  const update = useCallback(async (id: string, patch: SavedViewPatch): Promise<string | null> => {
    if (!slug) return 'No workspace selected';
    try {
      const saved = await viewsApi.update(slug, id, patch);
      setViews(list => list.map(view => (view._id === id ? saved : view)));
      return null;
    } catch (error) {
      return getApiErrorMessage(error, 'We could not change this view. Try again.');
    }
  }, [slug, setViews]);

  const remove = useCallback(async (id: string): Promise<string | null> => {
    if (!slug) return 'No workspace selected';
    try {
      await viewsApi.remove(slug, id);
      setViews(list => list.filter(view => view._id !== id));
      return null;
    } catch (error) {
      return getApiErrorMessage(error, 'We could not delete this view. Try again.');
    }
  }, [slug, setViews]);

  return {
    views,
    loading: Boolean(slug) && !current,
    failed: current?.failed ?? false,
    create,
    update,
    remove,
  };
};
