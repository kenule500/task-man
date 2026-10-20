import { useCallback, useEffect, useRef, useState } from 'react';
import i18n from '@/i18n';
import { aiPlanApi } from '../api';
import { readPlanError } from '../lib/file';
import { tidyPlan } from '../lib/plan';
import type { AiPlan, CreatedFromPlan, PlanApiError, PlanContent, PlanDestination, PlanUploadOptions } from '../types';

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
}

const MAX_POLL_FAILURES = 5;
const isRunning = (plan: AiPlan | null): boolean => plan?.status === 'queued' || plan?.status === 'running';

/**
 * The whole "project from a document" flow: upload, wait for the generation (polling), edit the plan, create the project.
 * The document itself is only kept in memory here (for "Regenerate"); the server never stores it.
 */
export const useAiProjectPlan = (slug: string | undefined, { pollMs = 2000, maxWaitMs = 8 * 60_000, onPlanId }: Settings = {}) => {
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
  const [destination, setDestination] = useState<PlanDestination>('new');
  const [targetProjectId, setTargetProjectId] = useState<string | null>(null);
  const onPlanIdRef = useRef(onPlanId);
  useEffect(() => { onPlanIdRef.current = onPlanId; });

  const planId = plan?._id;
  const planStatus = plan?.status;

  /** Takes the destination a plan was stored with, so a reload or a resume shows where it will land. */
  const rememberDestination = useCallback((stored: { targetProjectId?: string | null } | undefined) => {
    const id = stored?.targetProjectId ?? null;
    setTargetProjectId(id);
    setDestination(id ? 'existing' : 'new');
  }, []);

  // ---- Polling while the server works
  useEffect(() => {
    if (!slug || !planId || (planStatus !== 'queued' && planStatus !== 'running')) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    const started = Date.now();
    let failures = 0;

    const tick = async () => {
      try {
        const next = await aiPlanApi.get(slug, planId, controller.signal);
        if (cancelled) return;
        failures = 0;
        if (next.status === 'queued' || next.status === 'running') {
          if (next.status !== planStatus) setPlan(next);
        } else {
          setPlan(next);
          rememberDestination(next.options);
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
      if (Date.now() - started > maxWaitMs) {
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
  }, [slug, planId, planStatus, pollMs, maxWaitMs, rememberDestination]);

  const reset = useCallback(() => {
    setPlan(null);
    setDraft(null);
    setDirty(false);
    setTimedOut(false);
    setCreateError(null);
    setDestination('new');
    setTargetProjectId(null);
    onPlanIdRef.current?.(null);
  }, []);

  /** Uploads the document; the generation continues on the server. */
  const start = useCallback(async (file: File, options: PlanUploadOptions): Promise<boolean> => {
    if (!slug) return false;
    setUploading(true);
    setError(null);
    setTimedOut(false);
    setRequest({ file, options });
    setDestination(options.destination ?? (options.targetProjectId ? 'existing' : 'new'));
    setTargetProjectId(options.targetProjectId ?? null);
    try {
      const queued = await aiPlanApi.upload(slug, file, options);
      setPlan(queued);
      setDraft(null);
      setDirty(false);
      setCreateError(null);
      onPlanIdRef.current?.(queued._id);
      return true;
    } catch (err) {
      setError(readPlanError(err, i18n.t('aiPlan:errors.uploadFailed')));
      return false;
    } finally {
      setUploading(false);
    }
  }, [slug]);

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
      rememberDestination(found.options);
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
  }, [slug, rememberDestination]);

  /** Changes where the ready plan goes; the next create sends this target without regenerating. */
  const changeDestination = useCallback((next: PlanDestination, nextTargetId: string | null) => {
    setCreateError(null);
    setDestination(next);
    setTargetProjectId(next === 'existing' ? nextTargetId : null);
    setRequest(current => (current
      ? { ...current, options: { ...current.options, destination: next, targetProjectId: next === 'existing' ? nextTargetId : null } }
      : current));
  }, []);

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
    return start(request.file, request.options);
  }, [slug, request, plan, reset, start]);

  /** Edits the draft; nothing is sent until the project is created. */
  const edit = useCallback((change: (current: PlanContent) => PlanContent) => {
    setDraft(current => (current ? change(current) : current));
    setDirty(true);
  }, []);

  /** Saves the edits and creates the plan in the chosen destination. Returns null (with `createError` set) when refused. */
  const create = useCallback(async (): Promise<CreatedFromPlan | null> => {
    if (!slug || !plan || !draft) return null;
    setCreating(true);
    setCreateError(null);
    try {
      const saved = tidyPlan(draft);
      await aiPlanApi.update(slug, plan._id, saved);
      const storedTargetId = plan.options.targetProjectId ?? null;
      const storedDestination: PlanDestination = storedTargetId ? 'existing' : 'new';
      const unchanged = destination === storedDestination && targetProjectId === storedTargetId;
      const override = destination === 'existing' ? targetProjectId : null;
      const created = unchanged
        ? await aiPlanApi.create(slug, plan._id)
        : await aiPlanApi.create(slug, plan._id, override);
      return created;
    } catch (err) {
      setCreateError(readPlanError(err, i18n.t('aiPlan:errors.createFailed')));
      return null;
    } finally {
      setCreating(false);
    }
  }, [slug, plan, draft, destination, targetProjectId]);

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
    destination,
    targetProjectId,
    start,
    resume,
    discard,
    regenerate,
    edit,
    create,
    changeDestination,
    clearError: () => setError(null),
    clearCreateError: () => setCreateError(null),
  };
};
