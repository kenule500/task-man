import { useCallback, useEffect, useRef, useState } from 'react';
import i18n from '@/i18n';
import { aiPlanApi } from '../api';
import { readPlanError } from '../lib/file';
import { tidyPlan } from '../lib/plan';
import { subscribePlanUpdates } from '../lib/planSocket';
import type { AiPlan, CreatedFromPlan, PlanApiError, PlanContent, PlanUploadOptions } from '../types';

export type PlanPhase = 'upload' | 'analyzing' | 'review' | 'creating';

export interface PlanRequest {
  file: File;
  options: PlanUploadOptions;
}

interface Settings {
  /** Time between two status checks. */
  pollMs?: number;
  /** After this long the screen says the generation is taking unusually long (the server gives up after 10 minutes). */
  maxWaitMs?: number;
  /** Called with the plan id when one is started or loaded, and with null when it is gone (to keep the address in step). */
  onPlanId?: (id: string | null) => void;
  /** The project the plan is added to; null (the default) creates a new project. */
  targetProjectId?: string | null;
}

const MAX_POLL_FAILURES = 5;
const isRunning = (plan: AiPlan | null): boolean => plan?.status === 'queued' || plan?.status === 'running';

/** A hidden tab has nobody watching it, so it stops asking until it is visible again. */
const isHidden = (): boolean => typeof document !== 'undefined' && document.visibilityState === 'hidden';

/**
 * The whole "project from a document" flow: upload, wait for the generation (polling), edit the plan, create the project.
 * The document itself is only kept in memory here (for "Regenerate"); the server never stores it.
 */
export const useAiProjectPlan = (
  slug: string | undefined,
  { pollMs = 2000, maxWaitMs = 8 * 60_000, onPlanId, targetProjectId = null }: Settings = {},
) => {
  const [plan, setPlan] = useState<AiPlan | null>(null);
  const [draft, setDraft] = useState<PlanContent | null>(null);
  const [dirty, setDirty] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<PlanApiError | null>(null);
  const [createError, setCreateError] = useState<PlanApiError | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const [request, setRequest] = useState<PlanRequest | null>(null);
  const onPlanIdRef = useRef(onPlanId);
  useEffect(() => { onPlanIdRef.current = onPlanId; });

  const planId = plan?._id;
  const planStatus = plan?.status;
  /** The server pushes plan status changes, so polling is only a fallback while that channel is down. */
  const [live, setLive] = useState(false);

  const applyPlan = useCallback((next: AiPlan) => {
    setPlan(next);
    if (next.status === 'ready') {
      setDraft(next.plan ?? null);
      setDirty(false);
    }
  }, []);

  /** The plan whose status was already read once on connect: a re-subscribe does not read it again. */
  const caughtUpFor = useRef<string | null>(null);

  // ---- Push while the server works (no status request at all while the socket is connected)
  useEffect(() => {
    if (!slug || !planId || (planStatus !== 'queued' && planStatus !== 'running')) return;
    let cancelled = false;
    const refresh = async () => {
      try {
        const next = await aiPlanApi.get(slug, planId);
        if (!cancelled) applyPlan(next);
      } catch {
        // The event did not help after all: fall back to the slow status polling
        if (!cancelled) setLive(false);
      }
    };
    const subscription = subscribePlanUpdates(
      update => { if (!cancelled && update.planId === planId) void refresh(); },
      connected => {
        if (cancelled) return;
        setLive(connected);
        if (!connected) {
          // A later reconnect must catch up: an event sent while the channel was down is not replayed
          caughtUpFor.current = null;
          return;
        }
        // One catch-up read per plan, and one after every reconnect. Re-subscribing because the
        // status changed is not a reconnect, so it costs no extra request.
        if (caughtUpFor.current !== planId) {
          caughtUpFor.current = planId;
          void refresh();
        }
      },
    );
    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [slug, planId, planStatus, applyPlan]);

  // ---- Polling while the server works (fallback: no socket, no token or a dropped connection)
  useEffect(() => {
    if (live) return;
    if (!slug || !planId || (planStatus !== 'queued' && planStatus !== 'running')) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    // Only the time somebody could actually be waiting counts, so a hidden tab never runs the budget down
    let waited = 0;
    let visibleSince = isHidden() ? null : Date.now();
    let failures = 0;

    const tick = async () => {
      if (isHidden()) {
        if (visibleSince !== null) {
          waited += Date.now() - visibleSince;
          visibleSince = null;
        }
        // Not a failure and not a timeout: the wait resumes where it left off when the tab is shown
        timer = setTimeout(() => {
          void tick();
        }, pollMs);
        return;
      }
      if (visibleSince === null) visibleSince = Date.now();
      try {
        const next = await aiPlanApi.get(slug, planId, controller.signal);
        if (cancelled) return;
        failures = 0;
        if (next.status === 'queued' || next.status === 'running') {
          if (next.status !== planStatus) setPlan(next);
        } else {
          setPlan(next);
          if (next.status === 'ready') {
            setDraft(next.plan ?? null);
            setDirty(false);
          }
          return;
        }
      } catch (err) {
        if (cancelled) return;
        const problem = readPlanError(err, i18n.t('aiPlan:errors.loadFailed'));
        failures += 1;
        if (problem.status === 404) {
          setPlan(null);
          setError({ ...problem, message: i18n.t('aiPlan:errors.gone') });
          onPlanIdRef.current?.(null);
          return;
        }
        if (failures >= MAX_POLL_FAILURES) {
          setError(problem);
          return;
        }
      }
      if (waited + (Date.now() - visibleSince) > maxWaitMs) {
        setTimedOut(true);
        return;
      }
      timer = setTimeout(() => { void tick(); }, pollMs);
    };

    timer = setTimeout(() => { void tick(); }, pollMs);
    return () => {
      cancelled = true;
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [slug, planId, planStatus, pollMs, maxWaitMs, live]);

  const reset = useCallback(() => {
    setPlan(null);
    setDraft(null);
    setDirty(false);
    setTimedOut(false);
    setCreateError(null);
    onPlanIdRef.current?.(null);
  }, []);

  /** Uploads the document; the generation continues on the server. Returns the queued plan (null when it did not start). */
  const start = useCallback(async (file: File, options: PlanUploadOptions): Promise<AiPlan | null> => {
    if (!slug) return null;
    const target = targetProjectId ?? null;
    const payload: PlanUploadOptions = { ...options, destination: target ? 'existing' : 'new', targetProjectId: target };
    setUploading(true);
    setError(null);
    setTimedOut(false);
    setRequest({ file, options: payload });
    try {
      const queued = await aiPlanApi.upload(slug, file, payload);
      setPlan(queued);
      setDraft(null);
      setDirty(false);
      setCreateError(null);
      onPlanIdRef.current?.(queued._id);
      return queued;
    } catch (err) {
      setError(readPlanError(err, i18n.t('aiPlan:errors.uploadFailed')));
      return null;
    } finally {
      setUploading(false);
    }
  }, [slug, targetProjectId]);

  /** Opens a plan by id (after a reload). Returns the project id when the plan was already turned into a project. */
  const resume = useCallback(async (id: string): Promise<string | null> => {
    if (!slug) return null;
    setLoading(true);
    setError(null);
    try {
      const found = await aiPlanApi.get(slug, id);
      if (found.status === 'created' && found.projectId) return found.projectId;
      if (found.status === 'failed') {
        setError({ status: null, code: found.errorCode, message: found.error || i18n.t('aiPlan:errors.failed'), suggestion: '' });
        onPlanIdRef.current?.(null);
        return null;
      }
      setPlan(found);
      setDraft(found.status === 'ready' ? found.plan ?? null : null);
      setDirty(false);
      onPlanIdRef.current?.(found._id);
      return null;
    } catch (err) {
      const problem = readPlanError(err, i18n.t('aiPlan:errors.loadFailed'));
      setError(problem.status === 404 ? { ...problem, message: i18n.t('aiPlan:errors.gone') } : problem);
      onPlanIdRef.current?.(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, [slug]);

  /** Stops waiting and deletes the plan (a generation that is still running is cancelled on the server). */
  const discard = useCallback(async (): Promise<void> => {
    const current = plan;
    if (!slug || !current) return;
    setCancelling(true);
    try {
      await aiPlanApi.remove(slug, current._id);
    } catch (err) {
      // 404: it is already gone, which is what the person wanted
      const problem = readPlanError(err, i18n.t('aiPlan:errors.cancelFailed'));
      if (problem.status !== 404) {
        setError(problem);
        setCancelling(false);
        return;
      }
    }
    setCancelling(false);
    reset();
  }, [slug, plan, reset]);

  /** Runs the same document with the same options again (needs the file still held in this browser tab). */
  const regenerate = useCallback(async (): Promise<boolean> => {
    if (!slug || !request) return false;
    const previous = plan;
    reset();
    if (previous) await aiPlanApi.remove(slug, previous._id).catch(() => undefined);
    return (await start(request.file, request.options)) !== null;
  }, [slug, request, plan, reset, start]);

  /** Edits the draft; nothing is sent until the project is created. */
  const edit = useCallback((change: (current: PlanContent) => PlanContent) => {
    setDraft(current => (current ? change(current) : current));
    setDirty(true);
  }, []);

  /** Saves the edits and creates the plan in the project this page is scoped to (or as a new project). */
  const create = useCallback(async (): Promise<CreatedFromPlan | null> => {
    if (!slug || !plan || !draft) return null;
    setCreating(true);
    setCreateError(null);
    try {
      const saved = tidyPlan(draft);
      await aiPlanApi.update(slug, plan._id, saved);
      return await aiPlanApi.create(slug, plan._id, targetProjectId ?? null);
    } catch (err) {
      setCreateError(readPlanError(err, i18n.t('aiPlan:errors.createFailed')));
      return null;
    } finally {
      setCreating(false);
    }
  }, [slug, plan, draft, targetProjectId]);

  const phase: PlanPhase = creating ? 'creating' : isRunning(plan) ? 'analyzing' : plan?.status === 'ready' && draft ? 'review' : 'upload';

  return {
    phase,
    plan,
    draft,
    dirty,
    uploading,
    loading,
    creating,
    cancelling,
    error,
    createError,
    timedOut,
    request,
    start,
    resume,
    discard,
    regenerate,
    edit,
    create,
    clearError: () => setError(null),
    clearCreateError: () => setCreateError(null),
  };
};
