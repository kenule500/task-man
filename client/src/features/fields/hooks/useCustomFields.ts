import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import { useParams } from 'react-router-dom';
import { fieldsApi } from '../api';
import type { CustomField, CustomFieldInput, CustomFieldPatch } from '../types';

// One cache per workspace slug, shared by every view on screen; saving in the settings updates all of them.
const cache = new Map<string, CustomField[]>();
const inflight = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();
const NONE: CustomField[] = [];

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

const publish = (slug: string, fields: CustomField[]) => {
  cache.set(slug, [...fields].sort((a, b) => a.order - b.order));
  listeners.forEach(listener => listener());
};

const load = (slug: string): Promise<void> => {
  const pending = inflight.get(slug);
  if (pending) return pending;
  const request = (async () => {
    try {
      publish(slug, await fieldsApi.list(slug));
    } catch {
      // Tasks still work without custom fields
    } finally {
      inflight.delete(slug);
    }
  })();
  inflight.set(slug, request);
  return request;
};

/** Test helper: forget every cached list. */
export const resetCustomFieldsCache = () => {
  cache.clear();
  inflight.clear();
  listeners.forEach(listener => listener());
};

export interface UseCustomFields {
  /** Every field including archived ones, in display order. */
  fields: CustomField[];
  /** Fields people can fill in (not archived). */
  active: CustomField[];
  /** False until the list was fetched (or when it could not be). */
  loaded: boolean;
  reload: () => Promise<void>;
  create: (input: CustomFieldInput) => Promise<CustomField>;
  update: (id: string, patch: CustomFieldPatch) => Promise<CustomField>;
  remove: (id: string) => Promise<void>;
  reorder: (ids: string[]) => Promise<void>;
}

/**
 * The custom fields of a workspace. Without an argument the slug comes from the route (`/:workspaceSlug/...`).
 * Writes need `settings:manage` and reject with the API error.
 */
export const useCustomFields = (slugArg?: string): UseCustomFields => {
  const params = useParams();
  const slug = slugArg ?? params.workspaceSlug;
  const cached = useSyncExternalStore(subscribe, () => (slug ? cache.get(slug) : undefined));

  useEffect(() => {
    if (slug && !cache.has(slug)) void load(slug);
  }, [slug]);

  const fields = cached ?? NONE;
  const active = useMemo(() => fields.filter(field => !field.archived), [fields]);

  const need = useCallback((): string => {
    if (!slug) throw new Error('No workspace selected');
    return slug;
  }, [slug]);

  const reload = useCallback(async () => { if (slug) await load(slug); }, [slug]);

  const create = useCallback(async (input: CustomFieldInput) => {
    const workspace = need();
    const created = await fieldsApi.create(workspace, input);
    publish(workspace, [...(cache.get(workspace) ?? []), created]);
    return created;
  }, [need]);

  const update = useCallback(async (id: string, patch: CustomFieldPatch) => {
    const workspace = need();
    const saved = await fieldsApi.update(workspace, id, patch);
    publish(workspace, (cache.get(workspace) ?? []).map(field => (field._id === id ? saved : field)));
    return saved;
  }, [need]);

  const remove = useCallback(async (id: string) => {
    const workspace = need();
    await fieldsApi.remove(workspace, id);
    publish(workspace, (cache.get(workspace) ?? []).filter(field => field._id !== id));
  }, [need]);

  const reorder = useCallback(async (ids: string[]) => {
    const workspace = need();
    publish(workspace, await fieldsApi.reorder(workspace, ids));
  }, [need]);

  return { fields, active, loaded: cached !== undefined, reload, create, update, remove, reorder };
};
