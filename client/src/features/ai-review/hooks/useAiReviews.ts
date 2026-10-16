import { useCallback, useEffect, useRef, useState } from 'react';
import i18n from '@/i18n';
import { getApiErrorMessage } from '@/utils/api';
import { aiReviewApi } from '../api';
import { POLL_INTERVAL_MS, hasActiveReview, pickShown } from '../lib/review';
import type { AiReview } from '../types';

/**
 * Reviews of one task (latest 10) with the full result of the one being shown.
 * Mount it with a `key` of the task id: a different task starts from scratch.
 * While a review is queued or running the list is polled every few seconds, then the result is loaded.
 */
export const useAiReviews = (slug: string | undefined, taskId: string | undefined) => {
  const [reviews, setReviews] = useState<AiReview[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, AiReview>>({});
  const [starting, setStarting] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  // Load once, and again after "Try again"
  useEffect(() => {
    if (!slug || !taskId) return;
    let cancelled = false;
    aiReviewApi.list(slug, taskId)
      .then(list => {
        if (cancelled) return;
        setReviews(list);
        setError('');
      })
      .catch(err => {
        if (!cancelled) setError(getApiErrorMessage(err, i18n.t('ai:panel.loadError')));
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => { cancelled = true; };
  }, [slug, taskId, attempt]);

  const active = hasActiveReview(reviews);

  // Poll while something runs
  useEffect(() => {
    if (!slug || !taskId || !active) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      aiReviewApi.list(slug, taskId)
        .then(list => { if (!cancelled) setReviews(list); })
        .catch(() => { /* keep the last list; the next tick tries again */ });
    }, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [slug, taskId, active, reviews]);

  const shown = pickShown(reviews, selectedId);
  const shownId = shown?._id;
  const shownDone = shown?.status === 'completed';

  // Full result (criteria, issues) of the review being shown, once it has completed (a failed one has none)
  useEffect(() => {
    if (!slug || !taskId || !shownId || !shownDone || details[shownId]) return;
    let cancelled = false;
    aiReviewApi.get(slug, taskId, shownId)
      .then(full => { if (!cancelled) setDetails(current => ({ ...current, [full._id]: full })); })
      .catch(err => { if (!cancelled) setError(getApiErrorMessage(err, i18n.t('ai:panel.loadError'))); });
    return () => { cancelled = true; };
  }, [slug, taskId, shownId, shownDone, details]);

  const reload = useCallback(() => {
    setError('');
    setLoaded(false);
    setAttempt(current => current + 1);
  }, []);

  /** Queues a review; rejects with a readable message (feature off, daily limit, already running...). */
  const start = useCallback(async (prUrl?: string): Promise<AiReview> => {
    if (!slug || !taskId) throw new Error('No task selected');
    setStarting(true);
    try {
      const queued = await aiReviewApi.run(slug, taskId, prUrl);
      if (mounted.current) {
        setReviews(current => [queued, ...current.filter(review => review._id !== queued._id)].slice(0, 10));
        setSelectedId(queued._id);
      }
      return queued;
    } catch (err) {
      throw new Error(getApiErrorMessage(err, i18n.t('ai:panel.runError')), { cause: err });
    } finally {
      if (mounted.current) setStarting(false);
    }
  }, [slug, taskId]);

  return {
    reviews,
    shown: shown ? details[shown._id] ?? shown : null,
    loading: !loaded && !error,
    error,
    reload,
    start,
    starting,
    active,
    select: setSelectedId,
  };
};
