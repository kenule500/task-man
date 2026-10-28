import { useCallback, useEffect, useState } from 'react';
import api from '@/utils/api';

/**
 * Attachment bytes, fetched through the authenticated client and shared per attachment id.
 *
 * The v1 surface linked straight at `GET .../chat/attachments/:id`, which the browser opens without a
 * bearer header and which therefore answered `Not authorized, no token` (AC-089). Fetching a blob over
 * the axios instance keeps the token in the header (NFR-039) and no URL ever carries it.
 *
 * One cache entry per attachment id, refcounted by the number of mounted consumers, so paging back and
 * forth re-renders from memory instead of refetching, and the last unmount revokes the object URL so
 * memory does not grow for the life of the tab (FR-087, AC-090, NFR-031).
 */

interface CacheEntry {
  url: string;
  refs: number;
}

/** Module scope: the cache has to outlive any single message row. */
const cache = new Map<string, CacheEntry>();
/** In-flight fetches, so two rows for the same attachment share one request. */
const pending = new Map<string, Promise<string>>();

const fetchBlobUrl = async (slug: string, attachmentId: string): Promise<string> => {
  const { data } = await api.get(
    `/workspaces/${encodeURIComponent(slug)}/chat/attachments/${encodeURIComponent(attachmentId)}`,
    { responseType: 'blob' },
  );
  return URL.createObjectURL(data as Blob);
};

const acquire = async (slug: string, attachmentId: string): Promise<string> => {
  const cached = cache.get(attachmentId);
  if (cached) {
    cached.refs += 1;
    return cached.url;
  }

  const inFlight = pending.get(attachmentId);
  if (inFlight) {
    const url = await inFlight;
    const entry = cache.get(attachmentId);
    if (entry) entry.refs += 1;
    return url;
  }

  const request = fetchBlobUrl(slug, attachmentId)
    .then(url => {
      cache.set(attachmentId, { url, refs: 1 });
      return url;
    })
    .finally(() => { pending.delete(attachmentId); });

  pending.set(attachmentId, request);
  return request;
};

const release = (attachmentId: string): void => {
  const entry = cache.get(attachmentId);
  if (!entry) return;
  entry.refs -= 1;
  if (entry.refs > 0) return;
  cache.delete(attachmentId);
  URL.revokeObjectURL(entry.url);
};

/**
 * Forget an in-flight fetch so the next `acquire` starts a real request.
 *
 * Deliberately does not touch a resolved cache entry: a retry after a failure has no URL cached, and
 * revoking one that a neighbouring row is still rendering would blank that row instead (FR-087).
 */
const dropPending = (attachmentId: string): void => {
  pending.delete(attachmentId);
};

/** Test seam: one place to reset the module state between renders. */
export const clearAttachmentCache = (): void => {
  for (const entry of cache.values()) URL.revokeObjectURL(entry.url);
  cache.clear();
  pending.clear();
};

export interface AttachmentUrlState {
  /** Object URL of the fetched bytes, or `null` while loading or after a failure. */
  url: string | null;
  loading: boolean;
  /** True when the fetch failed; the card renders a retryable placeholder (EC-037). */
  failed: boolean;
  retry: () => void;
}

/**
 * The blob URL for one attachment, refcounted across every consumer.
 * A failed fetch is a readable state, not a thrown error: nothing here rejects into React (NFR-041).
 */
export const useAttachmentUrl = (
  slug: string | undefined,
  attachmentId: string | undefined,
  enabled = true,
): AttachmentUrlState => {
  const [fetched, setFetched] = useState<string | null>(null);
  const [settled, setSettled] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  // A URL already in the cache is read during render rather than pushed into state from an effect:
  // the row paints from memory on its first frame, and no cascading render is triggered (AC-090).
  const cachedUrl = attachmentId ? cache.get(attachmentId)?.url ?? null : null;
  const url = fetched ?? cachedUrl;
  // Loading is derived, not stored: a row is loading while it has no URL and has not settled yet, so
  // the effect never has to set state just to announce that a request started.
  const loading = Boolean(slug && attachmentId && enabled) && !url && !settled && !failed;

  useEffect(() => {
    if (!slug || !attachmentId || !enabled) return undefined;

    let cancelled = false;
    let acquired = false;
    const id = attachmentId;

    // Hold a reference for as long as this row is mounted. `acquire` bumps the refcount synchronously
    // on the cached path, so the flag is set here rather than in a microtask a fast unmount could
    // outrace (AC-090, NFR-031).
    const hold = () => {
      acquired = true;
      void acquire(slug, id);
    };

    if (cache.has(id)) {
      hold();
      return () => { release(id); };
    }

    acquire(slug, id)
      .then(objectUrl => {
        acquired = true;
        if (cancelled) {
          // The row went away while the request was in flight: drop the reference it never used
          release(id);
          return;
        }
        setFetched(objectUrl);
      })
      .catch(() => {
        if (cancelled) return;
        setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setSettled(true);
      });

    return () => {
      cancelled = true;
      if (acquired) release(id);
    };
    // `attempt` is the retry trigger: a new value runs the fetch again
  }, [slug, attachmentId, enabled, attempt]);

  const retry = useCallback(() => {
    // A failed fetch cached no URL, but a request could still be in flight or already resolved by a
    // neighbouring row; only the in-flight record is dropped, so the next run reaches the network
    // without revoking bytes someone else is rendering (EC-037, FR-087).
    if (attachmentId) dropPending(attachmentId);
    setFetched(null);
    setSettled(false);
    setFailed(false);
    setAttempt(value => value + 1);
  }, [attachmentId]);

  return { url, loading, failed, retry };
};

export default useAttachmentUrl;