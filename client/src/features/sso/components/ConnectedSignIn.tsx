import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Surface, SectionHeader, toast } from '@/components/ds';
import ConfirmActionDialog from '@/components/ConfirmActionDialog';
import { getApiErrorMessage } from '@/utils/api';
import { ssoApi } from '../api';
import type { SsoMethod, SsoMethodsState } from '../types';
import { ProviderIcon } from './ProviderIcon';

const LABELS = { google: 'Google', microsoft: 'Microsoft' } as const;

/**
 * "Connected sign-in methods" on the Security page. Hidden when the server offers no providers and none are linked
 * (and while it loads or fails: the rest of the page does not depend on it).
 */
export const ConnectedSignIn = () => {
  const [state, setState] = useState<SsoMethodsState | null>(null);
  const [pending, setPending] = useState<SsoMethod | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    ssoApi.methods()
      .then((loaded) => { if (!cancelled) setState(loaded); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  const unlink = useCallback(async (method: SsoMethod) => {
    setBusy(true);
    try {
      await ssoApi.unlink(method.provider);
      setState((current) => current && { ...current, methods: current.methods.filter((item) => item.provider !== method.provider) });
      toast.success(`${LABELS[method.provider]} sign-in removed.`);
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, 'Could not remove that sign-in method. Try again.'));
    } finally {
      setBusy(false);
      setPending(null);
    }
  }, []);

  if (!state || (state.methods.length === 0 && state.available.length === 0)) return null;

  const onlyWay = !state.hasPassword && state.methods.length <= 1;

  return (
    <Surface padding="lg" aria-labelledby="connected-sign-in-heading">
      <SectionHeader title={<span id="connected-sign-in-heading">Connected sign-in methods</span>} />

      {state.methods.length === 0 ? (
        <p className="text-sm text-slate-600">
          No provider is connected. Sign in once with Google or Microsoft using the email address of this account and it is connected
          automatically, as long as the provider has verified that address.
        </p>
      ) : (
        <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200">
          {state.methods.map((method) => (
            <li key={method.provider} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:gap-4 sm:p-4">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
                  <ProviderIcon provider={method.provider} />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900">{LABELS[method.provider]}</p>
                  <p className="break-words text-xs text-slate-600">{method.email ?? 'Email not shared'}</p>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                disabled={busy || onlyWay}
                onClick={() => setPending(method)}
                aria-label={`Remove ${LABELS[method.provider]} sign-in`}
                className="h-11 w-full sm:h-9 sm:w-auto"
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}

      {onlyWay && (
        <p className="mt-4 text-xs text-slate-600">
          This is the only way to sign in to your account. To remove it, first set a password with &ldquo;Forgot password&rdquo; on the sign-in page.
        </p>
      )}

      <ConfirmActionDialog
        open={pending !== null}
        onOpenChange={(open) => !open && !busy && setPending(null)}
        title={pending ? `Remove ${LABELS[pending.provider]} sign-in?` : 'Remove sign-in method?'}
        description="You will no longer be able to sign in with it. Your account and data stay as they are."
        confirmLabel="Remove"
        busyLabel="Removing..."
        busy={busy}
        onConfirm={() => pending && void unlink(pending)}
      />
    </Surface>
  );
};
