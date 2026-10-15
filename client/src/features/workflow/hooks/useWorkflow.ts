import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { useParams } from 'react-router-dom';
import { workflowApi } from '../api';
import { STATUS_STAGES } from '../lib/stages';
import type { WorkflowStage, WorkflowUpdate } from '../types';

// One cache per workspace slug, shared by every view on screen; saving the settings updates all of them.
const cache = new Map<string, WorkflowStage[]>();
const inflight = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

const publish = (slug: string, stages: WorkflowStage[]) => {
  cache.set(slug, stages);
  listeners.forEach(listener => listener());
};

const load = (slug: string): Promise<void> => {
  const pending = inflight.get(slug);
  if (pending) return pending;
  const request = (async () => {
    try {
      const stages = await workflowApi.get(slug);
      if (stages.length > 0) publish(slug, stages);
    } catch {
      // The board still works with the plain status columns
    } finally {
      inflight.delete(slug);
    }
  })();
  inflight.set(slug, request);
  return request;
};

/** The stages already loaded for a workspace (no fetch), for code outside React such as optimistic updates. */
export const cachedWorkflow = (slug: string | undefined): WorkflowStage[] | undefined => (slug ? cache.get(slug) : undefined);

/** Test helper: forget every cached workflow. */
export const resetWorkflowCache = () => {
  cache.clear();
  inflight.clear();
  listeners.forEach(listener => listener());
};

export interface UseWorkflow {
  /** The workspace's stages in board order; the three plain statuses until the workflow is loaded. */
  stages: WorkflowStage[];
  /** False while loading or when the API could not be reached (stages are then the plain statuses). */
  loaded: boolean;
  /** Replaces the workflow (needs settings:manage); rejects with the API error. */
  save: (update: WorkflowUpdate) => Promise<WorkflowStage[]>;
  reload: () => Promise<void>;
}

/**
 * The workflow stages of a workspace. Without an argument the slug comes from the route (`/:workspaceSlug/...`),
 * so views need no extra props; outside a workspace route the plain status columns are used.
 */
export const useWorkflow = (slugArg?: string): UseWorkflow => {
  const params = useParams();
  const slug = slugArg ?? params.workspaceSlug;
  const stages = useSyncExternalStore(subscribe, () => (slug ? cache.get(slug) : undefined));

  useEffect(() => {
    if (slug && !cache.has(slug)) void load(slug);
  }, [slug]);

  const save = useCallback(async (update: WorkflowUpdate) => {
    if (!slug) throw new Error('No workspace selected');
    const saved = await workflowApi.save(slug, update);
    publish(slug, saved);
    return saved;
  }, [slug]);

  const reload = useCallback(async () => {
    if (!slug) return;
    await load(slug);
  }, [slug]);

  return { stages: stages ?? STATUS_STAGES, loaded: stages !== undefined, save, reload };
};
