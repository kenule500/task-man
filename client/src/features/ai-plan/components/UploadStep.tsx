import { useId, useState, type DragEvent, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { FileUp, FileText, Lock, Sparkles, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Alert, Field, SegmentedControl, Surface } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { LANGUAGE_NAMES, SUPPORTED_LANGUAGES } from '@/i18n';
import { OptionSelect } from '@/features/tasks/components/TaskSelects';
import type { AiSettings } from '@/features/ai-review/types';
import { todayKey } from '@/features/tasks/lib/date';
import { ACCEPT_ATTRIBUTE, DEFAULT_MAX_BYTES, fileProblem, formatFileSize } from '../lib/file';
import { defaultOptions } from '../lib/options';
import { cleanKey } from '../lib/plan';
import { describeApiError } from '../lib/errors';
import type { AiPlan, PlanApiError, PlanLanguage, PlanUploadOptions } from '../types';
import type { PlanRequest } from '../hooks/useAiProjectPlan';

const LANGUAGE_OPTIONS = SUPPORTED_LANGUAGES.map(value => ({ value, label: LANGUAGE_NAMES[value] }));
const WEEKS = [1, 2, 3, 4] as const;
const MAX_NOTES = 500;

interface UploadStepProps {
  slug: string;
  settings: AiSettings | null;
  settingsLoading: boolean;
  settingsError: string;
  onRetrySettings: () => void;
  /** The person can change workspace settings, so the notice can link to where AI is switched on. */
  canManageSettings: boolean;
  /** Document and options of an earlier attempt (after a failure or a cancel). */
  initial: PlanRequest | null;
  busy: boolean;
  error: PlanApiError | null;
  /** The generation that just ended without a plan. */
  failure: string;
  recent: AiPlan[];
  onOpenRecent: (plan: AiPlan) => void;
  onOpenActive: () => void;
  onStart: (file: File, options: PlanUploadOptions) => void;
}

/** Step 1: pick the requirements document, set the options, and see what happens to the text before sending it. */
export const UploadStep = ({
  slug, settings, settingsLoading, settingsError, onRetrySettings, canManageSettings, initial, busy, error, failure, recent, onOpenRecent, onOpenActive, onStart,
}: UploadStepProps) => {
  const { t } = useTranslation('aiPlan');
  const inputId = useId();
  const [file, setFile] = useState<File | null>(initial?.file ?? null);
  const [fileError, setFileError] = useState('');
  const [dragging, setDragging] = useState(false);
  const [options, setOptions] = useState<PlanUploadOptions>(initial?.options ?? defaultOptions());

  const maxBytes = settings?.plan.maxBytes ?? DEFAULT_MAX_BYTES;
  const limitReached = settings ? settings.plan.usedToday >= settings.plan.dailyLimit : false;
  const aiReady = Boolean(settings?.available && settings.enabled) && !limitReached;
  const change = <K extends keyof PlanUploadOptions>(name: K, value: PlanUploadOptions[K]) => setOptions(current => ({ ...current, [name]: value }));

  const choose = (chosen: File) => {
    const problem = fileProblem(chosen, maxBytes);
    if (problem) {
      setFile(null);
      setFileError(t(`upload.fileProblem.${problem}`, { size: formatFileSize(maxBytes) }));
      return;
    }
    setFileError('');
    setFile(chosen);
  };

  const drop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragging(false);
    const dropped = event.dataTransfer.files?.[0];
    if (dropped) choose(dropped);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (file && aiReady && !busy) onStart(file, options);
  };

  const dateInvalid = options.startDate !== '' && options.startDate < todayKey();

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      {(error || failure) && (
        <Alert tone="error" title={t('upload.cannotStart')}>
          {error ? describeApiError(error, t) : failure}
          {error?.code === 'PLAN_IN_PROGRESS' && (
            <Button type="button" variant="outline" size="sm" onClick={onOpenActive} className="mt-2 h-10 rounded-lg sm:h-8">{t('upload.openRunning')}</Button>
          )}
        </Alert>
      )}

      {/* ---- Is AI on, and what leaves the building */}
      <Surface padding="md" className="space-y-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-text-strong"><Lock aria-hidden className="size-4 text-text-subtle" /> {t('notice.title')}</h2>
        <p className="text-sm text-text-body">{t('notice.body')}</p>
        <ul className="list-disc space-y-1 ps-5 text-sm text-text-body marker:text-text-faint">
          <li>{t('notice.sent')}</li>
          <li>{t('notice.stored', { days: 30 })}</li>
          <li>{t('notice.untrusted')}</li>
        </ul>
        {settingsLoading ? (
          <p role="status" className="text-sm text-text-subtle">{t('notice.checking')}</p>
        ) : settingsError ? (
          <Alert tone="error">
            {settingsError}
            <Button type="button" variant="outline" size="sm" onClick={onRetrySettings} className="mt-2 h-10 rounded-lg sm:h-8">{t('notice.retry')}</Button>
          </Alert>
        ) : settings && !settings.available ? (
          <Alert tone="warning" title={t('notice.unavailableTitle')}>{t('notice.unavailableBody')}</Alert>
        ) : settings && !settings.enabled ? (
          <Alert tone="warning" title={t('notice.offTitle')}>
            {t('notice.offBody')}{' '}
            {canManageSettings
              ? <Link to={`/${slug}/settings`} className="font-medium underline underline-offset-2">{t('notice.openSettings')}</Link>
              : t('notice.askAdmin')}
          </Alert>
        ) : settings ? (
          limitReached ? (
            <Alert tone="warning" title={t('notice.limitTitle')}>{t('notice.limitBody', { limit: settings.plan.dailyLimit })}</Alert>
          ) : (
            <p role="status" className="flex items-center gap-2 text-sm text-success-fg">
              <Sparkles aria-hidden className="size-4" /> {t('notice.on', { used: settings.plan.usedToday, limit: settings.plan.dailyLimit })}
            </p>
          )
        ) : null}
      </Surface>

      {/* ---- The document */}
      <Surface padding="md" className="space-y-3">
        <h2 className="text-sm font-semibold text-text-strong">{t('upload.documentTitle')}</h2>
        <label
          htmlFor={inputId}
          onDragOver={event => { event.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={drop}
          className={cn(
            'flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-border-strong bg-surface-sunken px-4 py-8 text-center transition-colors sm:py-10',
            'hover:border-primary hover:bg-info-bg has-focus-visible:border-primary has-focus-visible:ring-2 has-focus-visible:ring-primary has-focus-visible:ring-offset-2',
            dragging && 'border-primary bg-info-bg',
          )}
        >
          <FileUp aria-hidden className="size-8 text-text-subtle" />
          <span className="text-sm font-medium text-text-strong">{t('upload.dropTitle')}</span>
          <span className="text-xs text-text-subtle">{t('upload.dropHint', { size: formatFileSize(maxBytes) })}</span>
          <input
            id={inputId}
            type="file"
            accept={ACCEPT_ATTRIBUTE}
            className="sr-only"
            onChange={event => {
              const chosen = event.target.files?.[0];
              if (chosen) choose(chosen);
              // The same file can be chosen again after a fix
              event.target.value = '';
            }}
          />
        </label>

        {fileError && <Alert tone="error">{fileError}</Alert>}

        {file && (
          <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-surface-raised px-3 py-2">
            <FileText aria-hidden className="size-5 shrink-0 text-text-subtle" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-text-strong">{file.name}</span>
              <span className="block text-xs tabular-nums text-text-subtle">{formatFileSize(file.size)}</span>
            </span>
            <Button type="button" variant="ghost" size="icon" onClick={() => setFile(null)} aria-label={t('upload.removeFile', { name: file.name })} className="size-10 md:size-9">
              <X aria-hidden />
            </Button>
          </div>
        )}
      </Surface>

      {/* ---- Options */}
      <Surface padding="md" className="space-y-4">
        <h2 className="text-sm font-semibold text-text-strong">{t('upload.optionsTitle')}</h2>
        <p className="text-sm text-text-subtle">{t('upload.optionsHint')}</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t('upload.projectName')} htmlFor={`${inputId}-name`} hint={t('upload.projectNameHint')}>
            <Input
              id={`${inputId}-name`}
              value={options.projectName}
              maxLength={60}
              onChange={event => change('projectName', event.target.value)}
              className="h-11 rounded-lg border-border-strong bg-surface-raised text-base shadow-none sm:h-9 sm:text-sm"
            />
          </Field>
          <Field label={t('upload.projectKey')} htmlFor={`${inputId}-key`} hint={t('upload.projectKeyHint')}>
            <Input
              id={`${inputId}-key`}
              value={options.projectKey}
              maxLength={6}
              onChange={event => change('projectKey', cleanKey(event.target.value))}
              className="h-11 rounded-lg border-border-strong bg-surface-raised font-mono text-base uppercase shadow-none sm:h-9 sm:text-sm"
            />
          </Field>
          <div className="space-y-1.5">
            <p className="text-sm font-medium text-slate-700">{t('upload.sprintLength')}</p>
            <SegmentedControl
              aria-label={t('upload.sprintLength')}
              value={String(options.sprintLengthWeeks)}
              onValueChange={value => change('sprintLengthWeeks', Number(value))}
              options={WEEKS.map(weeks => ({ value: String(weeks), label: t('upload.weeks', { count: weeks }) }))}
              // Four equal parts that fit a phone even with long labels (French, Arabic)
              className="flex w-full *:min-w-0 *:flex-1 *:px-1"
            />
          </div>
          <Field label={t('upload.startDate')} htmlFor={`${inputId}-start`} error={dateInvalid ? t('upload.startDatePast') : undefined} hint={t('upload.startDateHint')}>
            <Input
              id={`${inputId}-start`}
              type="date"
              value={options.startDate}
              min={todayKey()}
              aria-invalid={dateInvalid}
              onChange={event => change('startDate', event.target.value)}
              className="h-11 rounded-lg border-border-strong bg-surface-raised text-base shadow-none sm:h-9 sm:text-sm"
            />
          </Field>
          <Field label={t('upload.teamSize')} htmlFor={`${inputId}-team`} hint={t('upload.teamSizeHint')}>
            <Input
              id={`${inputId}-team`}
              type="number"
              inputMode="numeric"
              min={1}
              max={200}
              value={options.teamSize}
              onChange={event => change('teamSize', event.target.value)}
              className="h-11 rounded-lg border-border-strong bg-surface-raised text-base shadow-none sm:h-9 sm:text-sm"
            />
          </Field>
          <Field label={t('upload.language')} htmlFor={`${inputId}-lang`} hint={t('upload.languageHint')}>
            <OptionSelect<PlanLanguage>
              id={`${inputId}-lang`}
              aria-label={t('upload.language')}
              value={options.language}
              options={LANGUAGE_OPTIONS}
              onChange={value => change('language', value)}
              className="max-md:h-11"
            />
          </Field>
        </div>
        <Field
          label={t('upload.notes')}
          htmlFor={`${inputId}-notes`}
          hint={t('upload.notesHint', { count: options.extraInstructions.length, max: MAX_NOTES })}
        >
          <Textarea
            id={`${inputId}-notes`}
            value={options.extraInstructions}
            maxLength={MAX_NOTES}
            rows={3}
            onChange={event => change('extraInstructions', event.target.value)}
            className="rounded-lg border-border-strong bg-surface-raised text-base shadow-none md:text-sm"
          />
        </Field>
      </Surface>

      {recent.length > 0 && (
        <Surface padding="md" className="space-y-3">
          <h2 className="text-sm font-semibold text-text-strong">{t('recent.title')}</h2>
          <ul className="divide-y divide-slate-100">
            {recent.slice(0, 3).map(plan => (
              <li key={plan._id} className="flex items-center gap-3 py-2">
                <FileText aria-hidden className="size-4 shrink-0 text-text-subtle" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-text-strong">{plan.source.fileName}</span>
                  <span className="block text-xs text-text-subtle">{t(`recent.status.${plan.status === 'ready' ? 'ready' : 'working'}`)}</span>
                </span>
                <Button type="button" variant="outline" size="sm" onClick={() => onOpenRecent(plan)} className="h-10 rounded-lg sm:h-8">
                  {t('recent.open')}<span className="sr-only"> {plan.source.fileName}</span>
                </Button>
              </li>
            ))}
          </ul>
        </Surface>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
        {!file && <p className="text-sm text-text-subtle sm:me-auto">{t('upload.needFile')}</p>}
        <Button
          type="submit"
          disabled={!file || !aiReady || busy || dateInvalid}
          aria-busy={busy}
          className="h-11 gap-2 rounded-lg bg-primary text-white shadow-sm hover:bg-primary-hover sm:h-9"
        >
          <Sparkles aria-hidden className="size-4" /> {busy ? t('upload.uploading') : t('upload.submit')}
        </Button>
      </div>
    </form>
  );
};
