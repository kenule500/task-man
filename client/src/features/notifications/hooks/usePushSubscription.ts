import { useCallback, useEffect, useRef, useState } from 'react';
import { pushApi } from '../api';
import { baseState, isPushSupported, urlBase64ToUint8Array, type PushState } from '../lib/push';

const READY_TIMEOUT_MS = 5000;

/** The page's service worker registration, or an error when it is not running (e.g. a dev server). */
const readyRegistration = (): Promise<ServiceWorkerRegistration> =>
  Promise.race([
    navigator.serviceWorker.ready,
    new Promise<never>((_resolve, reject) => {
      window.setTimeout(
        () => reject(new Error('The background service is not ready yet. Reload the page and try again.')),
        READY_TIMEOUT_MS,
      );
    }),
  ]);

const errorMessage = (error: unknown, fallback: string): string => {
  const response = (error as { response?: { data?: { message?: string } } }).response;
  return response?.data?.message || (error instanceof Error && error.message) || fallback;
};

/**
 * Whether this device receives push notifications and how to turn that on or off. Nothing prompts
 * on load: the permission dialog only opens from `enable`, which a click calls.
 */
export const usePushSubscription = () => {
  const [state, setState] = useState<PushState>('checking');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const publicKey = useRef<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const settle = (next: PushState) => { if (!cancelled && mounted.current) setState(next); };

    const check = async () => {
      if (!isPushSupported()) { settle('unsupported'); return; }
      let config;
      try {
        config = await pushApi.config();
      } catch {
        // Treated like "not available": the rest of the page still works
        settle('unavailable');
        return;
      }
      publicKey.current = config.publicKey;
      const base = baseState({ supported: true, serverEnabled: config.enabled, permission: Notification.permission });
      if (base !== 'off') { settle(base); return; }
      try {
        const registration = await navigator.serviceWorker.getRegistration();
        const existing = await registration?.pushManager.getSubscription();
        if (existing && Notification.permission === 'granted') {
          // Keep the server in step with this browser (best effort)
          void pushApi.subscribe(existing.toJSON()).catch(() => undefined);
          settle('on');
        } else {
          settle('off');
        }
      } catch {
        settle('off');
      }
    };
    void check();
    return () => { cancelled = true; };
  }, []);

  const enable = useCallback(async () => {
    setError(null);
    if (!publicKey.current) return;
    setBusy(true);
    try {
      // Only here, from a click, does the browser ask for permission
      const permission = await Notification.requestPermission();
      if (permission === 'denied') { setState('denied'); return; }
      if (permission !== 'granted') {
        setError('Permission was not granted. Choose Allow when your browser asks.');
        return;
      }
      const registration = await readyRegistration();
      // A subscription made with another key cannot be reused
      await (await registration.pushManager.getSubscription())?.unsubscribe();
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey.current),
      });
      try {
        await pushApi.subscribe(subscription.toJSON());
      } catch (failure) {
        await subscription.unsubscribe().catch(() => undefined);
        throw failure;
      }
      setState('on');
    } catch (failure) {
      setError(errorMessage(failure, 'Could not turn on push notifications. Try again.'));
    } finally {
      if (mounted.current) setBusy(false);
    }
  }, []);

  const disable = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await pushApi.unsubscribe(subscription.endpoint);
        await subscription.unsubscribe();
      }
      setState('off');
    } catch (failure) {
      setError(errorMessage(failure, 'Could not turn off push notifications. Try again.'));
    } finally {
      if (mounted.current) setBusy(false);
    }
  }, []);

  return { state, busy, error, enable, disable };
};

/** Best effort: stop pushing to this browser for the account that is signing out. Never throws. */
export const unsubscribeThisDevice = async (): Promise<void> => {
  try {
    if (!isPushSupported()) return;
    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    if (!subscription) return;
    await pushApi.unsubscribe(subscription.endpoint).catch(() => undefined);
    await subscription.unsubscribe();
  } catch {
    // Signing out must not depend on it
  }
};
