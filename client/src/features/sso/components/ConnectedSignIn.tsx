import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation('settings');
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
      toast.success(t('connected.removed', { provider: LABELS[method.provider] }));
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, t('connected.removeFailed')));
    } finally {
      setBusy(false);
      setPending(null);
    }
  }, [t]);

  if (!state || (state.methods.length === 0 && state.available.length === 0)) return null;

  const onlyWay = !state.hasPassword && state.methods.length <= 1;

  return (
    <Surface padding="lg" aria-labelledby="connected-sign-in-heading">
      <SectionHeader title={<span id="connected-sign-in-heading">{t('connected.title')}</span>} />

      {state.methods.length === 0 ? (
        <p className="text-sm text-slate-600">
          {t('connected.none')}
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
                  <p className="break-words text-xs text-slate-600">{method.email ?? t('connected.emailNotShared')}</p>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                disabled={busy || onlyWay}
                onClick={() => setPending(method)}
                aria-label={t('connected.removeLabel', { provider: LABELS[method.provider] })}
                className="h-11 w-full sm:h-9 sm:w-auto"
              >
                {t('connected.remove')}
              </Button>
            </li>
          ))}
        </ul>
      )}

      {onlyWay && (
        <p className="mt-4 text-xs text-slate-600">
          {t('connected.onlyWay')}
        </p>
      )}

      <ConfirmActionDialog
        open={pending !== null}
        onOpenChange={(open) => !open && !busy && setPending(null)}
        title={pending ? t('connected.confirmTitle', { provider: LABELS[pending.provider] }) : t('connected.confirmTitleGeneric')}
        description={t('connected.confirmDescription')}
        confirmLabel={t('connected.remove')}
        busyLabel={t('connected.removing')}
        busy={busy}
        onConfirm={() => pending && void unlink(pending)}
      />
    </Surface>
  );
};
