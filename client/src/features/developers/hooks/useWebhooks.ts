import i18n from '@/i18n';
import { useCallback, useEffect, useState } from 'react';
import { getApiErrorMessage } from '@/utils/api';
import { webhooksApi } from '../api';
import type { Webhook, WebhookDelivery, WebhookInput, WebhookWithSecret } from '../types';

const toWebhook = ({ secret: _secret, ...hook }: WebhookWithSecret): Webhook => {
  void _secret;
  return hook;
};

/**
 * Webhooks of a workspace. Only fetches when `enabled` (the user holds settings:manage).
 * Mutations reject with a readable message; create and rotate resolve with the secret, shown once.
 */
export const useWebhooks = (slug: string | undefined, enabled: boolean) => {
  const [hooks, setHooks] = useState<Webhook[]>([]);
  const [error, setError] = useState('');
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const key = slug && enabled ? `${slug}:${attempt}` : null;
  const loading = key !== null && loadedKey !== key;

  useEffect(() => {
    if (!slug || !enabled) return;
    let cancelled = false;
    const currentKey = `${slug}:${attempt}`;
    webhooksApi.list(slug)
      .then(list => {
        if (cancelled) return;
        setHooks(list);
        setError('');
      })
      .catch(err => {
        if (!cancelled) setError(getApiErrorMessage(err, i18n.t('admin:developers.errors.loadHooks')));
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
    if (!slug) throw new Error(i18n.t('admin:developers.errors.noWorkspace'));
    try {
      return await request();
    } catch (err) {
      throw new Error(getApiErrorMessage(err, fallback), { cause: err });
    }
  }, [slug]);

  const createHook = useCallback(async (input: WebhookInput): Promise<WebhookWithSecret> => {
    const created = await run(() => webhooksApi.create(slug!, input), i18n.t('admin:developers.errors.createHook'));
    setHooks(current => [...current, toWebhook(created)]);
    return created;
  }, [slug, run]);

  const updateHook = useCallback(async (id: string, patch: Partial<WebhookInput> & { active?: boolean }): Promise<Webhook> => {
    const updated = await run(() => webhooksApi.update(slug!, id, patch), i18n.t('admin:developers.webhookSaveError'));
    setHooks(current => current.map(hook => (hook._id === id ? updated : hook)));
    return updated;
  }, [slug, run]);

  const deleteHook = useCallback(async (id: string): Promise<void> => {
    await run(() => webhooksApi.remove(slug!, id), i18n.t('admin:developers.hookDeleteError'));
    setHooks(current => current.filter(hook => hook._id !== id));
  }, [slug, run]);

  const rotateSecret = useCallback(
    (id: string): Promise<WebhookWithSecret> => run(() => webhooksApi.rotateSecret(slug!, id), i18n.t('admin:developers.rotateError')),
    [slug, run],
  );

  const sendTest = useCallback(async (id: string): Promise<WebhookDelivery> => {
    const delivery = await run(() => webhooksApi.test(slug!, id), i18n.t('admin:developers.testError'));
    // A test changes the failure counter and last delivery time
    const fresh = await webhooksApi.list(slug!).catch(() => null);
    if (fresh) setHooks(fresh);
    return delivery;
  }, [slug, run]);

  const loadDeliveries = useCallback(
    (id: string) => run(() => webhooksApi.deliveries(slug!, id), i18n.t('admin:developers.deliveriesLoadError')),
    [slug, run],
  );

  const redeliver = useCallback(
    (id: string, deliveryId: string) => run(() => webhooksApi.redeliver(slug!, id, deliveryId), i18n.t('admin:developers.redeliverError')),
    [slug, run],
  );

  return { hooks, loading, error, reload, createHook, updateHook, deleteHook, rotateSecret, sendTest, loadDeliveries, redeliver };
};
