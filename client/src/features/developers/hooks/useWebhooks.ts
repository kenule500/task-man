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
        if (!cancelled) setError(getApiErrorMessage(err, 'We could not load the webhooks.'));
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
    if (!slug) throw new Error('No workspace selected');
    try {
      return await request();
    } catch (err) {
      throw new Error(getApiErrorMessage(err, fallback), { cause: err });
    }
  }, [slug]);

  const createHook = useCallback(async (input: WebhookInput): Promise<WebhookWithSecret> => {
    const created = await run(() => webhooksApi.create(slug!, input), 'We could not create the webhook.');
    setHooks(current => [...current, toWebhook(created)]);
    return created;
  }, [slug, run]);

  const updateHook = useCallback(async (id: string, patch: Partial<WebhookInput> & { active?: boolean }): Promise<Webhook> => {
    const updated = await run(() => webhooksApi.update(slug!, id, patch), 'We could not save the webhook.');
    setHooks(current => current.map(hook => (hook._id === id ? updated : hook)));
    return updated;
  }, [slug, run]);

  const deleteHook = useCallback(async (id: string): Promise<void> => {
    await run(() => webhooksApi.remove(slug!, id), 'We could not delete the webhook.');
    setHooks(current => current.filter(hook => hook._id !== id));
  }, [slug, run]);

  const rotateSecret = useCallback(
    (id: string): Promise<WebhookWithSecret> => run(() => webhooksApi.rotateSecret(slug!, id), 'We could not rotate the secret.'),
    [slug, run],
  );

  const sendTest = useCallback(async (id: string): Promise<WebhookDelivery> => {
    const delivery = await run(() => webhooksApi.test(slug!, id), 'We could not send the test event.');
    // A test changes the failure counter and last delivery time
    const fresh = await webhooksApi.list(slug!).catch(() => null);
    if (fresh) setHooks(fresh);
    return delivery;
  }, [slug, run]);

  const loadDeliveries = useCallback(
    (id: string) => run(() => webhooksApi.deliveries(slug!, id), 'We could not load the deliveries.'),
    [slug, run],
  );

  const redeliver = useCallback(
    (id: string, deliveryId: string) => run(() => webhooksApi.redeliver(slug!, id, deliveryId), 'We could not send the delivery again.'),
    [slug, run],
  );

  return { hooks, loading, error, reload, createHook, updateHook, deleteHook, rotateSecret, sendTest, loadDeliveries, redeliver };
};
