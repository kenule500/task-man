import { useEffect, useState } from 'react';
import { workspaceApi, type WorkspaceMember } from '@/features/workspace';

/**
 * Workspace members for the assignee picker. Only fetches when `enabled`
 * (the user can read users and the picker is open); a failure simply yields an empty list.
 */
export const useWorkspaceMembers = (slug: string | undefined, enabled: boolean) => {
  const [loaded, setLoaded] = useState<{ slug: string; members: WorkspaceMember[] } | null>(null);

  useEffect(() => {
    if (!slug || !enabled) return;
    let cancelled = false;
    workspaceApi.members(slug)
      .then(members => { if (!cancelled) setLoaded({ slug, members }); })
      .catch(() => { if (!cancelled) setLoaded({ slug, members: [] }); });
    return () => { cancelled = true; };
  }, [slug, enabled]);

  const ready = Boolean(slug) && loaded?.slug === slug;
  return { members: ready && loaded ? loaded.members : [], loading: Boolean(slug) && enabled && !ready };
};
