import { useCallback, useState } from 'react';
import { toast } from '@/components/ds';
import type { Release, ReleasePatch } from '../types';

/** Archive / reopen a release with a toast; `busyId` is the release being changed. */
export const useReleaseStatus = (update: (id: string, patch: ReleasePatch) => Promise<unknown>, onDone?: () => void) => {
  const [busyId, setBusyId] = useState<string | null>(null);

  const change = useCallback(async (release: Release, status: 'archived' | 'unreleased', message: string) => {
    setBusyId(release._id);
    try {
      await update(release._id, { status });
      toast.success(`${release.name} ${message}`);
      onDone?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not change the release.');
    } finally {
      setBusyId(null);
    }
  }, [update, onDone]);

  return {
    busyId,
    archive: useCallback((release: Release) => change(release, 'archived', 'archived'), [change]),
    reopen: useCallback((release: Release) => change(release, 'unreleased', 'reopened'), [change]),
  };
};
