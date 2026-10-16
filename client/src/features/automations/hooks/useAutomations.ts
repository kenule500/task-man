import i18n from '@/i18n';
import { useCallback, useEffect, useState } from 'react';
import { getApiErrorMessage } from '@/utils/api';
import { automationsApi } from '../api';
import type { Automation, AutomationInput, AutomationTemplate } from '../types';

/**
 * Rules and templates of a workspace. Only fetches when `enabled` (the user holds settings:manage).
 * Mutations resolve with the saved rule and reject with a readable message.
 */
export const useAutomations = (slug: string | undefined, enabled: boolean) => {
  const [rules, setRules] = useState<Automation[]>([]);
  const [templates, setTemplates] = useState<AutomationTemplate[]>([]);
  const [error, setError] = useState('');
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const key = slug && enabled ? `${slug}:${attempt}` : null;
  const loading = key !== null && loadedKey !== key;

  useEffect(() => {
    if (!slug || !enabled) return;
    let cancelled = false;
    const currentKey = `${slug}:${attempt}`;
    Promise.all([
      automationsApi.list(slug),
      // Templates are a convenience: the page still works without them
      automationsApi.templates(slug).catch(() => [] as AutomationTemplate[]),
    ])
      .then(([list, recipes]) => {
        if (cancelled) return;
        setRules(list);
        setTemplates(recipes);
        setError('');
      })
      .catch(err => {
        if (!cancelled) setError(getApiErrorMessage(err, i18n.t('admin:automations.errors.load')));
      })
      .finally(() => {
        if (!cancelled) setLoadedKey(currentKey);
      });
    return () => { cancelled = true; };
  }, [slug, enabled, attempt]);

  const reload = useCallback(() => {
    setError('');
    setAttempt(current => current + 1);
  }, []);

  const run = useCallback(async <T,>(request: () => Promise<T>, fallback: string): Promise<T> => {
    try {
      return await request();
    } catch (err) {
      throw new Error(getApiErrorMessage(err, fallback), { cause: err });
    }
  }, []);

  const createRule = useCallback(async (input: AutomationInput) => {
    if (!slug) throw new Error(i18n.t('admin:automations.errors.noWorkspace'));
    const rule = await run(() => automationsApi.create(slug, input), i18n.t('admin:automations.errors.save'));
    setRules(current => [...current, rule]);
    return rule;
  }, [slug, run]);

  const updateRule = useCallback(async (id: string, patch: Partial<AutomationInput>) => {
    if (!slug) throw new Error(i18n.t('admin:automations.errors.noWorkspace'));
    const rule = await run(() => automationsApi.update(slug, id, patch), i18n.t('admin:automations.errors.save'));
    setRules(current => current.map(item => (item._id === id ? rule : item)));
    return rule;
  }, [slug, run]);

  const deleteRule = useCallback(async (id: string) => {
    if (!slug) throw new Error(i18n.t('admin:automations.errors.noWorkspace'));
    await run(() => automationsApi.remove(slug, id), i18n.t('admin:automations.errors.delete'));
    setRules(current => current.filter(item => item._id !== id));
  }, [slug, run]);

  return { rules, templates, loading, error, reload, createRule, updateRule, deleteRule };
};
