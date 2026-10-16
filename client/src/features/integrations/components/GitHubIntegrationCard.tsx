import { useEffect, useState } from 'react';
import { Check, Copy, Eye, EyeOff, GitPullRequest, KeyRound } from 'lucide-react';
import { Trans, useTranslation } from 'react-i18next';
import { Alert, IconTile, SectionHeader, Spinner, Surface, SwitchField, toast } from '@/components/ds';
import { Button } from '@/components/ui/button';
import ConfirmActionDialog from '@/components/ConfirmActionDialog';
import { copyToClipboard } from '@/features/tasks/lib/taskKey';
import { getApiErrorMessage } from '@/utils/api';
import { integrationsApi } from '../api';
import type { GitHubIntegration } from '../types';

const FIELD =
  'min-w-0 flex-1 break-all rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 font-mono text-xs text-slate-800 sm:text-sm';
const OUTLINE_BTN = 'h-11 gap-2 rounded-lg border-slate-300 text-sm text-slate-700 shadow-none hover:bg-slate-100 sm:h-10';

const CopyField = ({ id, label, value, masked = false }: { id: string; label: string; value: string; masked?: boolean }) => {
  const { t } = useTranslation('settings');
  const [copied, setCopied] = useState(false);
  const [shown, setShown] = useState(false);

  const copy = async () => {
    if (await copyToClipboard(value)) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } else {
      toast.error(t('github.copyFailed'));
    }
  };

  const hidden = masked && !shown;
  return (
    <div>
      <p id={id} className="mb-1 text-xs font-medium text-slate-700">{label}</p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <code aria-labelledby={id} className={FIELD}>
          {hidden ? '•'.repeat(32) : value}
        </code>
        <div className="flex gap-2">
          {masked && (
            <Button
              type="button"
              variant="outline"
              aria-pressed={shown}
              onClick={() => setShown(current => !current)}
              className={OUTLINE_BTN}
            >
              {shown ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
              {shown ? t('github.hide') : t('github.show')}<span className="sr-only"> {label.toLowerCase()}</span>
            </Button>
          )}
          <Button type="button" variant="outline" onClick={() => { void copy(); }} className={OUTLINE_BTN}>
            {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
            {copied ? t('common:copied') : t('common:copy')}<span className="sr-only"> {label.toLowerCase()}</span>
          </Button>
        </div>
      </div>
      <p role="status" className="sr-only">{copied ? t('github.copiedStatus', { label }) : ''}</p>
    </div>
  );
};

const SetupSteps = () => {
  const { t } = useTranslation('settings');
  const components = { b: <strong />, c: <code className="font-mono text-xs" /> };
  return (
    <ol className="list-decimal space-y-1.5 ps-5 text-sm text-slate-700">
      {(['open', 'url', 'type', 'secret', 'events', 'save'] as const).map((step) => (
        <li key={step}><Trans t={t} i18nKey={`github.steps.${step}`} components={components} /></li>
      ))}
    </ol>
  );
};

/** Switch row: applies at once, labelled by its own text. */
const AutoTransitionSwitch = ({ checked, busy, onChange }: { checked: boolean; busy: boolean; onChange: (value: boolean) => void }) => {
  const { t } = useTranslation('settings');
  return (
    <SwitchField
      label={t('github.autoLabel')}
      description={t('github.autoDescription')}
      checked={checked}
      disabled={busy}
      onCheckedChange={onChange}
    />
  );
};

type Confirming = 'regenerate' | 'disable' | null;

/**
 * Settings card for the GitHub integration: enable, copy the webhook URL and secret,
 * choose whether pull requests move tasks, rotate the secret or turn it off.
 * Only mount it for members who hold settings:manage (the API requires it).
 */
const GitHubIntegrationCard = ({ workspaceSlug }: { workspaceSlug: string }) => {
  const { t } = useTranslation('settings');
  const [state, setState] = useState<GitHubIntegration | null>(null);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<Confirming>(null);

  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    integrationsApi.getGitHub(workspaceSlug)
      .then(data => { if (!cancelled) setState(data); })
      .catch(err => { if (!cancelled) setLoadError(getApiErrorMessage(err, t('github.loadFailed'))); });
    return () => { cancelled = true; };
  }, [workspaceSlug, attempt, t]);

  const retry = () => {
    setLoadError('');
    setAttempt(current => current + 1);
  };

  const run = async (action: () => Promise<GitHubIntegration>, failure: string, success?: string) => {
    setBusy(true);
    setActionError('');
    try {
      setState(await action());
      if (success) toast.success(success);
    } catch (err) {
      setActionError(getApiErrorMessage(err, failure));
    } finally {
      setBusy(false);
    }
  };

  const confirm = () => {
    const kind = confirming;
    setConfirming(null);
    if (kind === 'regenerate') {
      void run(() => integrationsApi.regenerateGitHubSecret(workspaceSlug), t('github.regenerateFailed'), t('github.regenerated'));
    } else if (kind === 'disable') {
      void run(() => integrationsApi.disableGitHub(workspaceSlug), t('github.disableFailed'), t('github.disabled'));
    }
  };

  return (
    <Surface as="section" aria-labelledby="integrations-heading" className="sm:p-6">
      <SectionHeader className="mb-1" title={<span id="integrations-heading">{t('github.title')}</span>} />
      <p className="mb-4 text-xs text-slate-600">
        <Trans t={t} i18nKey="github.intro" components={{ c: <code className="font-mono" /> }} />
      </p>

      <div className="rounded-xl border border-slate-200 p-4">
        <div className="mb-4 flex items-start gap-3">
          <IconTile size="sm" tone="neutral"><GitPullRequest /></IconTile>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-slate-900">GitHub</h3>
            <p className="text-xs text-slate-600">
              {state?.enabled ? t('github.connected') : t('github.notConnected')}
            </p>
          </div>
        </div>

        {loadError ? (
          <div className="space-y-3">
            <Alert tone="error">{loadError}</Alert>
            <Button type="button" variant="outline" onClick={retry} className={OUTLINE_BTN}>{t('common:retry')}</Button>
          </div>
        ) : !state ? (
          <p role="status" className="flex items-center gap-2 text-sm text-slate-600"><Spinner decorative />{t('github.loading')}</p>
        ) : !state.enabled ? (
          <div className="space-y-3">
            <p className="text-sm text-slate-700">
              {t('github.enableHint')}
            </p>
            {actionError && <Alert tone="error">{actionError}</Alert>}
            <Button
              type="button"
              disabled={busy}
              onClick={() => { void run(() => integrationsApi.enableGitHub(workspaceSlug), t('github.enableFailed')); }}
              className="h-11 gap-2 rounded-lg bg-primary px-5 text-sm font-medium text-white shadow-sm hover:bg-primary-hover sm:h-10"
            >
              <GitPullRequest aria-hidden /> {busy ? t('github.enabling') : t('github.enable')}
            </Button>
          </div>
        ) : (
          <div className="space-y-5">
            <CopyField id="gh-payload-url" label={t('github.payloadUrl')} value={state.webhookUrl} />
            {state.secret && <CopyField id="gh-secret" label={t('github.secret')} value={state.secret} masked />}

            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" disabled={busy} onClick={() => setConfirming('regenerate')} className={OUTLINE_BTN}>
                <KeyRound aria-hidden /> {t('github.regenerate')}
              </Button>
            </div>

            <AutoTransitionSwitch
              checked={state.autoTransition}
              busy={busy}
              onChange={value => { void run(() => integrationsApi.setGitHubAutoTransition(workspaceSlug, value), t('github.saveFailed')); }}
            />

            {actionError && <Alert tone="error">{actionError}</Alert>}

            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-700">{t('github.setUp')}</h4>
              <SetupSteps />
            </div>

            <div className="border-t border-slate-200 pt-4">
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => setConfirming('disable')}
                className="h-11 text-sm text-danger-fg hover:bg-danger-bg hover:text-danger-fg sm:h-10"
              >
                {t('github.turnOff')}
              </Button>
            </div>
          </div>
        )}
      </div>

      <ConfirmActionDialog
        open={confirming === 'regenerate'}
        onOpenChange={open => !open && setConfirming(null)}
        title={t('github.confirmRegenerate.title')}
        description={t('github.confirmRegenerate.description')}
        confirmLabel={t('github.regenerate')}
        onConfirm={confirm}
      />
      <ConfirmActionDialog
        open={confirming === 'disable'}
        onOpenChange={open => !open && setConfirming(null)}
        title={t('github.confirmDisable.title')}
        description={t('github.confirmDisable.description')}
        confirmLabel={t('twoFactor.turnOff')}
        onConfirm={confirm}
      />
    </Surface>
  );
};

export default GitHubIntegrationCard;
