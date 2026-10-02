import { useCallback, useEffect, useState } from 'react';
import { getApiErrorMessage } from '@/utils/api';
import { workspaceApi } from './api';
import type { WorkspaceDetails, WorkspaceMember } from './types';

/** Loads a workspace and its members; exposes a setter so pages can reflect edits without refetching. */
export const useWorkspaceData = (slug: string | undefined) => {
  const [workspace, setWorkspace] = useState<WorkspaceDetails | null>(null);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [error, setError] = useState('');
  const [loadedSlug, setLoadedSlug] = useState<string | null>(null);
  const loading = Boolean(slug) && loadedSlug !== slug;

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;

    Promise.all([workspaceApi.get(slug), workspaceApi.members(slug)])
      .then(([details, list]) => {
        if (cancelled) return;
        setWorkspace(details);
        setMembers(list);
        setError('');
      })
      .catch(err => {
        if (cancelled) return;
        setWorkspace(null);
        setMembers([]);
        setError(getApiErrorMessage(err, 'Failed to load the workspace.'));
      })
      .finally(() => {
        if (!cancelled) setLoadedSlug(slug);
      });

    return () => {
      cancelled = true;
    };
  }, [slug]);

  const clearError = useCallback(() => setError(''), []);

  return { workspace, setWorkspace, members, loading, error, clearError };
};
