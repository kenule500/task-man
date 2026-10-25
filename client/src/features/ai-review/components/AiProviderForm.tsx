import { useId, useState, type FormEvent } from 'react';
import { CheckCircle2, Eye, EyeOff, KeyRound, PlugZap, Save, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import ConfirmActionDialog from '@/components/ConfirmActionDialog';
import { Alert, Field, Spinner, fieldMessageId, toast } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatDateTimeIn } from '@/i18n/format';
import { OptionSelect } from '@/features/tasks/components/TaskSelects';
import { PROVIDER_OPTIONS, PROVIDER_PRESETS, defaultModelOf } from '../lib/providers';
import type {
  AiProviderChoice, AiProviderInput, AiProviderTestResult, AiSettings,
} from '../types';

const BUTTON = 'h-11 gap-2 rounded-lg text-sm sm:h-10';
const OUTLINE = `${BUTTON} border-slate-300 text-slate-700 shadow-none hover:bg-slate-100`;
const CONTROL = 'h-11 rounded-lg border border-slate-300 bg-white text-base text-slate-900 shadow-none placeholder:text-slate-500 focus-visible:border-slate-400 focus-visible:ring-0 sm:h-10 sm:text-sm';

interface FormErrors {
  model?: string;
  baseURL?: string;
  key?: string;
}

interface AiProviderFormProps {
  settings: AiSettings;
  onSave: (input: AiProviderInput) => Promise<AiSettings>;
  onRemove: () => Promise<AiSettings>;
  onTest: (input?: AiProviderInput) => Promise<AiProviderTestResult>;
}

/**
 * Workspace BYOK form. The key is write-only: it is never prefilled, and leaving it empty keeps the
 * saved key when the provider has not changed. The endpoint is editable only for the custom preset.
 */
const AiProviderForm = ({ settings, onSave, onRemove, onTest }: AiProviderFormProps) => {
  const { t } = useTranslation('ai');
  const providerId = useId();
  const modelId = useId();
  const baseId = useId();
  const keyId = useId();
  const configuredProvider: AiProviderChoice | null = settings.provider && settings.provider.id !== 'unknown'
    ? settings.provider.id
    : null;

  const [provider, setProvider] = useState<AiProviderChoice>(configuredProvider ?? 'qwen');
  const [model, setModel] = useState(settings.model || defaultModelOf(configuredProvider ?? 'qwen'));
  const [baseURL, setBaseURL] = useState(configuredProvider === 'custom' ? settings.config?.baseURL ?? '' : '');
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [testResult, setTestResult] = useState<AiProviderTestResult | null>(null);

  const config = settings.config;
  const preset = PROVIDER_PRESETS[provider];
  const isCustom = provider === 'custom';
  // The server only reuses the saved key for the same provider and the same endpoint.
  const trimURL = (value: string) => value.trim().replace(/\/+$/, '');
  const endpointUnchanged = !isCustom || trimURL(baseURL) === trimURL(config?.baseURL ?? '');
  const canKeepKey = configuredProvider === provider && Boolean(config?.keySet) && endpointUnchanged;
  const date = (value: string) => formatDateTimeIn(new Date(value), { dateStyle: 'medium', timeStyle: 'short' });

  const chooseProvider = (next: AiProviderChoice) => {
    setProvider(next);
    setModel(defaultModelOf(next));
    setBaseURL(next === 'custom' && configuredProvider === 'custom' ? config?.baseURL ?? '' : '');
    setErrors({});
    setTestResult(null);
    setActionError('');
  };

  const endpointProblem = (value: string): string => {
    if (!value.trim()) return t('settings.provider.errors.urlRequired');
    try {
      const url = new URL(value.trim());
      if (url.protocol !== 'https:') return t('settings.provider.errors.urlHttps');
      if (url.username || url.password || url.search || url.hash) return t('settings.provider.errors.urlCredentials');
      return '';
    } catch {
      return t('settings.provider.errors.urlInvalid');
    }
  };

  const validate = (): boolean => {
    const next: FormErrors = {};
    if (isCustom && !model.trim()) next.model = t('settings.provider.errors.modelRequired');
    if (isCustom) {
      const problem = endpointProblem(baseURL);
      if (problem) next.baseURL = problem;
    }
    if (!apiKey.trim() && !canKeepKey) next.key = t('settings.provider.errors.keyRequired');
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const input = (): AiProviderInput => ({
    provider,
    apiKey: apiKey.trim() || undefined,
    model: model.trim() || undefined,
    baseURL: isCustom ? baseURL.trim() : undefined,
  });

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!validate()) return;
    setBusy(true);
    setActionError('');
    try {
      await onSave(input());
      setApiKey('');
      setShowKey(false);
      toast.success(t('settings.provider.saved'));
    } catch (error) {
      setActionError((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    if (!validate()) return;
    setTesting(true);
    setActionError('');
    setTestResult(null);
    try {
      // Unchanged values test the saved configuration, so the server records the result.
      const unchanged = configuredProvider === provider
        && model.trim() === settings.model
        && (!isCustom || baseURL.trim() === (config?.baseURL ?? ''))
        && !apiKey.trim();
      setTestResult(await onTest(unchanged ? undefined : input()));
    } catch (error) {
      setActionError((error as Error).message);
    } finally {
      setTesting(false);
    }
  };

  const remove = async () => {
    setRemoving(true);
    setActionError('');
    try {
      await onRemove();
      setApiKey('');
      setShowKey(false);
      setConfirmRemove(false);
      toast.success(t('settings.provider.removed'));
    } catch (error) {
      setActionError((error as Error).message);
    } finally {
      setRemoving(false);
    }
  };

  const testStatus = config?.lastTestStatus === 'success'
    ? t('settings.provider.testSuccessShort')
    : t('settings.provider.testFailureShort');

  return (
    <section aria-labelledby="ai-provider-heading" className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/50 p-4">
      <div>
        <h3 id="ai-provider-heading" className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <KeyRound className="size-4 text-slate-500" aria-hidden /> {t('settings.provider.title')}
        </h3>
        <p className="mt-1 text-xs text-slate-600">{t('settings.provider.description')}</p>
      </div>

      <form onSubmit={event => { void save(event); }} className="space-y-4" noValidate>
        <Field label={t('settings.provider.label')} htmlFor={providerId}>
          <OptionSelect<AiProviderChoice>
            id={providerId}
            value={provider}
            options={PROVIDER_OPTIONS.map(option => ({ value: option.value, label: t(option.labelKey) }))}
            onChange={chooseProvider}
            aria-label={t('settings.provider.label')}
            disabled={busy || testing || removing}
          />
        </Field>

        <Field
          label={t('settings.provider.model')}
          htmlFor={modelId}
          required={isCustom}
          hint={isCustom ? t('settings.provider.modelCustomHint') : t('settings.provider.modelHint', { model: preset.model })}
          error={errors.model}
        >
          <Input
            id={modelId}
            dir="ltr"
            value={model}
            onChange={event => { setModel(event.target.value); setErrors(current => ({ ...current, model: undefined })); }}
            placeholder={preset.model || t('settings.provider.modelPlaceholder')}
            aria-invalid={errors.model ? true : undefined}
            aria-describedby={errors.model ? fieldMessageId(modelId) : undefined}
            maxLength={120}
            disabled={busy || testing || removing}
            className={`${CONTROL} font-mono`}
          />
        </Field>

        <Field
          label={t('settings.provider.baseURL')}
          htmlFor={baseId}
          required={isCustom}
          hint={isCustom ? t('settings.provider.baseURLHint') : t('settings.provider.presetHint')}
          error={errors.baseURL}
        >
          {isCustom ? (
            <Input
              id={baseId}
              type="url"
              inputMode="url"
              dir="ltr"
              value={baseURL}
              onChange={event => { setBaseURL(event.target.value); setErrors(current => ({ ...current, baseURL: undefined })); }}
              placeholder="https://api.example.com/v1"
              aria-invalid={errors.baseURL ? true : undefined}
              aria-describedby={errors.baseURL ? fieldMessageId(baseId) : undefined}
              maxLength={2048}
              disabled={busy || testing || removing}
              className={`${CONTROL} font-mono`}
            />
          ) : (
            <p id={baseId} dir="ltr" className="break-all rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-700">
              {preset.baseURL}
            </p>
          )}
        </Field>

        <Field
          label={t('settings.provider.key')}
          htmlFor={keyId}
          required={!canKeepKey}
          hint={canKeepKey ? t('settings.provider.keyKeep') : t('settings.provider.keyHint')}
          error={errors.key}
        >
          <div className="flex gap-2">
            <Input
              id={keyId}
              type={showKey ? 'text' : 'password'}
              dir="ltr"
              autoComplete="off"
              spellCheck={false}
              value={apiKey}
              onChange={event => { setApiKey(event.target.value); setErrors(current => ({ ...current, key: undefined })); }}
              placeholder={t('settings.provider.keyPlaceholder')}
              aria-invalid={errors.key ? true : undefined}
              aria-describedby={errors.key ? fieldMessageId(keyId) : undefined}
              maxLength={512}
              disabled={busy || testing || removing}
              className={`${CONTROL} font-mono`}
            />
            <Button
              type="button"
              variant="outline"
              aria-pressed={showKey}
              aria-label={showKey ? t('settings.provider.hideKey') : t('settings.provider.showKey')}
              onClick={() => setShowKey(current => !current)}
              className="size-11 shrink-0 rounded-lg border-slate-300 text-slate-700 shadow-none sm:size-10"
            >
              {showKey ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
            </Button>
          </div>
        </Field>

        <div className="space-y-1 text-xs text-slate-600">
          <p role="status">
            {config?.keySet
              ? (config.keyHint ? t('settings.provider.keySet', { hint: config.keyHint }) : t('settings.provider.keySetNoHint'))
              : t('settings.provider.keyNotSet')}
          </p>
          {config?.configuredAt && (
            <p>
              {config.configuredBy?.name
                ? t('settings.provider.configuredBy', { name: config.configuredBy.name, date: date(config.configuredAt) })
                : t('settings.provider.configuredOn', { date: date(config.configuredAt) })}
            </p>
          )}
          {config?.lastTestedAt
            ? <p>{t('settings.provider.lastTest', { status: testStatus, date: date(config.lastTestedAt) })}</p>
            : <p>{t('settings.provider.neverTested')}</p>}
        </div>

        {testResult && (
          <Alert tone={testResult.ok ? 'success' : 'error'} title={testResult.ok ? t('settings.provider.testSuccess') : t('settings.provider.testFailure')}>
            {t(`settings.provider.testCodes.${testResult.code}`, { defaultValue: testResult.code })}
          </Alert>
        )}

        {actionError && <Alert tone="error" onDismiss={() => setActionError('')}>{actionError}</Alert>}

        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={busy || testing || removing} className={`${BUTTON} bg-primary px-4 text-white hover:bg-primary-hover`}>
            <Save aria-hidden /> {busy ? t('settings.provider.saving') : t('settings.provider.save')}
          </Button>
          <Button type="button" variant="outline" onClick={() => { void test(); }} disabled={busy || testing || removing} className={OUTLINE}>
            {testing ? <Spinner decorative /> : <PlugZap aria-hidden />}
            {testing ? t('settings.provider.testing') : t('settings.provider.test')}
          </Button>
          {(configuredProvider || config?.keySet) && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => setConfirmRemove(true)}
              disabled={busy || testing || removing}
              className={`${BUTTON} text-danger-fg hover:bg-danger-bg hover:text-danger-fg`}
            >
              <Trash2 aria-hidden /> {t('settings.provider.remove')}
            </Button>
          )}
        </div>
        <p className="flex items-start gap-1.5 text-xs text-slate-500">
          <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {t('settings.provider.testHelp')}
        </p>
      </form>

      <ConfirmActionDialog
        open={confirmRemove}
        onOpenChange={setConfirmRemove}
        title={t('settings.provider.removeTitle')}
        description={t('settings.provider.removeBody')}
        confirmLabel={t('settings.provider.removeAction')}
        busyLabel={t('settings.provider.removing')}
        busy={removing}
        onConfirm={() => { void remove(); }}
      />
    </section>
  );
};

export default AiProviderForm;
