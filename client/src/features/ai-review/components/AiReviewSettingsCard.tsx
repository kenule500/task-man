import { useId, useState, type FormEvent } from 'react';
import { Bot, Eye, EyeOff, KeyRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Alert, IconTile, SectionHeader, Spinner, Surface, SwitchField, toast } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatNumber } from '@/i18n/format';
import { useAiSettings } from '../hooks/useAiSettings';
import type { AiSettingsPatch } from '../types';

const OUTLINE_BTN = 'h-11 gap-2 rounded-lg border-slate-300 text-sm text-slate-700 shadow-none hover:bg-slate-100 sm:h-10';
// GitHub tokens are letters, digits, "_" and "-" (classic, fine-grained and app tokens); the server checks the same
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{20,255}$/;

/**
 * Workspace settings card for the AI code review. Turning it on is the opt-in to send pull request code to
 * Alibaba Cloud Model Studio, so the notice sits above the switch. The GitHub token field is write-only.
 * Only mount it for members who hold settings:manage (the API requires it to change anything).
 */
const AiReviewSettingsCard = ({ workspaceSlug }: { workspaceSlug: string }) => {
  const { t } = useTranslation('ai');
  const tokenId = useId();
  const { settings, loading, error, reload, update } = useAiSettings(workspaceSlug);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [token, setToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [tokenError, setTokenError] = useState('');

  const save = async (patch: AiSettingsPatch, success?: string): Promise<boolean> => {
    setBusy(true);
    setActionError('');
    try {
      await update(patch);
      if (success) toast.success(success);
      return true;
    } catch (err) {
      setActionError((err as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const saveToken = async (event: FormEvent) => {
    event.preventDefault();
    const value = token.trim();
    if (!TOKEN_PATTERN.test(value)) {
      setTokenError(t('settings.token.invalid'));
      return;
    }
    setTokenError('');
    if (await save({ githubToken: value }, t('settings.token.saved'))) {
      setToken('');
      setShowToken(false);
    }
  };

  return (
    <Surface as="section" aria-labelledby="ai-review-heading" className="sm:p-6">
      <SectionHeader className="mb-1" title={<span id="ai-review-heading">{t('settings.title')}</span>} />
      <p className="mb-4 text-xs text-slate-600">{t('settings.description')}</p>

      <div className="rounded-xl border border-slate-200 p-4">
        <div className="mb-4 flex items-start gap-3">
          <IconTile size="sm" tone="neutral"><Bot /></IconTile>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-slate-900">Alibaba Cloud Model Studio</h3>
            {settings && <p className="text-xs text-slate-600">{t('settings.model', { model: settings.model })}</p>}
          </div>
        </div>

        {error ? (
          <div className="space-y-3">
            <Alert tone="error">{error}</Alert>
            <Button type="button" variant="outline" onClick={reload} className={OUTLINE_BTN}>{t('settings.retry')}</Button>
          </div>
        ) : !settings || loading ? (
          <p role="status" className="flex items-center gap-2 text-sm text-slate-600"><Spinner decorative />{t('settings.loading')}</p>
        ) : (
          <div className="space-y-5">
            {!settings.available && <Alert tone="warning">{t('settings.unavailable')}</Alert>}

            <Alert tone="warning" title={t('settings.notice.title')}>{t('settings.notice.body')}</Alert>

            <SwitchField
              label={t('settings.enable.label')}
              description={t('settings.enable.description')}
              checked={settings.enabled}
              disabled={busy || !settings.available}
              onCheckedChange={value => { void save({ enabled: value }); }}
            />

            <SwitchField
              label={t('settings.auto.label')}
              description={t('settings.auto.description')}
              checked={settings.autoReview && settings.enabled}
              disabled={busy || !settings.available || !settings.enabled}
              onCheckedChange={value => { void save({ autoReview: value }); }}
            />

            <form onSubmit={e => { void saveToken(e); }} className="space-y-2" noValidate>
              <label htmlFor={tokenId} className="block text-sm font-medium text-text-strong">{t('settings.token.label')}</label>
              <p className="text-xs text-text-body">{t('settings.token.help')}</p>
              <p role="status" className="text-xs font-medium text-slate-700">
                {settings.githubTokenSet ? t('settings.token.isSet') : t('settings.token.notSet')}
              </p>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                <div className="min-w-0 flex-1">
                  <div className="flex gap-2">
                    <Input
                      id={tokenId}
                      type={showToken ? 'text' : 'password'}
                      dir="ltr"
                      autoComplete="off"
                      spellCheck={false}
                      value={token}
                      onChange={event => { setToken(event.target.value); setTokenError(''); }}
                      placeholder={t('settings.token.placeholder')}
                      aria-invalid={tokenError ? true : undefined}
                      aria-describedby={tokenError ? `${tokenId}-error` : undefined}
                      maxLength={255}
                      className="h-11 rounded-lg border border-slate-300 bg-white font-mono text-base text-slate-900 shadow-none placeholder:text-slate-500 focus-visible:border-slate-400 focus-visible:ring-0 sm:h-10 sm:text-sm"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      aria-pressed={showToken}
                      aria-label={showToken ? t('settings.token.hide') : t('settings.token.show')}
                      onClick={() => setShowToken(current => !current)}
                      className="size-11 shrink-0 rounded-lg border-slate-300 text-slate-700 shadow-none sm:size-10"
                    >
                      {showToken ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
                    </Button>
                  </div>
                  {tokenError && <p id={`${tokenId}-error`} className="mt-1 text-xs text-danger-fg">{tokenError}</p>}
                </div>
                <div className="flex gap-2">
                  <Button type="submit" variant="outline" disabled={busy || token.trim() === ''} className={OUTLINE_BTN}>
                    <KeyRound aria-hidden /> {busy ? t('settings.token.saving') : t('settings.token.save')}
                  </Button>
                  {settings.githubTokenSet && (
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => { void save({ githubToken: null }, t('settings.token.removed')); }}
                      className="h-11 text-sm text-danger-fg hover:bg-danger-bg hover:text-danger-fg sm:h-10"
                    >
                      {t('settings.token.remove')}
                    </Button>
                  )}
                </div>
              </div>
            </form>

            {actionError && <Alert tone="error">{actionError}</Alert>}

            <div className="border-t border-slate-200 pt-4 text-sm text-slate-700">
              <p>
                <span className="font-medium">{t('settings.usage.label')}:</span>{' '}
                <span className="tabular-nums">{t('settings.usage.value', { used: formatNumber(settings.usedToday), limit: formatNumber(settings.dailyLimit) })}</span>
              </p>
              <p className="text-xs text-slate-600">{t('settings.usage.reset')}</p>
            </div>
          </div>
        )}
      </div>
    </Surface>
  );
};

export default AiReviewSettingsCard;
