import { useEffect, useRef } from 'react';
import { toast } from '@/components/ds';
import { describeLiveChange, isTaskContentChange } from '../lib/describe';
import { isLiveHeld, refreshLiveNow, subscribeIncoming } from '../lib/liveStore';

/**
 * Toasts when someone else changes the task that is open ("Dana moved WEB-12 to In Progress").
 * The "Refresh" action only appears when the view is not updating by itself (an unsaved form holds refreshes back).
 */
export const useOpenTaskChanges = (slug: string | undefined, taskId: string | undefined, label: string): void => {
  const labelRef = useRef(label);
  useEffect(() => {
    labelRef.current = label;
  }, [label]);

  useEffect(() => {
    if (!slug || !taskId) return;
    return subscribeIncoming(batch => {
      if (batch.slug !== slug) return;
      const mine = batch.changes.filter(change => change.task === taskId && isTaskContentChange(change.action));
      const latest = mine[mine.length - 1];
      if (!latest) return;
      const title = mine.length > 1 ? `${mine.length} changes to ${labelRef.current || 'this task'} by others` : describeLiveChange(latest, labelRef.current);
      toast(isLiveHeld()
        ? { title, action: { label: 'Refresh', onClick: () => refreshLiveNow(slug) } }
        : { title });
    });
  }, [slug, taskId]);
};
