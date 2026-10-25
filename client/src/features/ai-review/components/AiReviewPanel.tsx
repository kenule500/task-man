import { useContext, useId, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bot, Play, RotateCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Alert, Spinner } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PermissionContext } from '@/context/PermissionContext';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { TaskLink } from '@/features/tasks/types';
import { useAiReviews } from '../hooks/useAiReviews';
import { useAiSettings } from '../hooks/useAiSettings';
import { isActive, isPullRequestUrl, runBlock } from '../lib/review';
import ReviewHistory from './ReviewHistory';
import ReviewResult from './ReviewResult';

const OTHER = '__other__';

interface AiReviewPanelProps {
  task: { _id: string; links?: TaskLink[]; acceptanceCriteria?: unknown[] };
  /** Task key such as "WEB-12", used in the "link a pull request" hint. */
  taskKey?: string;
  workspaceSlug: string | undefined;
  /** Holds `tasks:write`: may start a review. */
  canWrite: boolean;
}

/** Linked pull requests, open ones first. */
const linkedPullRequests = (links: TaskLink[] | undefined): TaskLink[] =>
  (links ?? [])
    .filter(link => link.kind === 'pull_request')
    .sort((a, b) => Number(b.state === 'open') - Number(a.state === 'open') || Date.parse(b.updatedAt) - Date.parse(a.updatedAt));

/**
 * "AI code review" panel of the task dialog: pick a pull request, run the review, follow its progress and read the result.
 * Needs a workspace slug; renders nothing without one.
 */
const AiReviewPanel = ({ task, taskKey, workspaceSlug, canWrite }: AiReviewPanelProps) => {
  const { t } = useTranslation('ai');
  // Optional context: the panel also renders where no permission provider is mounted
  const canManage = useContext(PermissionContext)?.can('settings:manage') ?? false;
  const urlId = useId();
  const hintId = useId();
  const { settings, loading: settingsLoading, error: settingsError, reload: reloadSettings } = useAiSettings(workspaceSlug);
  const reviews = useAiReviews(workspaceSlug, task._id);
  const links = useMemo(() => linkedPullRequests(task.links), [task.links]);

  const [picked, setPicked] = useState<string>('');
  const [customUrl, setCustomUrl] = useState('');
  const [runError, setRunError] = useState('');

  if (!workspaceSlug) return null;

  // No linked pull request: the address field is the only way in
  const choice = links.length === 0 ? OTHER : (picked && (picked === OTHER || links.some(link => link.url === picked)) ? picked : links[0].url);
  const typed = customUrl.trim();
  const urlInvalid = choice === OTHER && typed !== '' && !isPullRequestUrl(typed);
  const hasPullRequest = choice === OTHER ? isPullRequestUrl(typed) : true;
  const block = runBlock({ settings, canWrite, hasPullRequest });
  const busy = reviews.starting || reviews.active;
  const shown = reviews.shown;
  const blockedMessage = settingsLoading ? '' : block === 'unavailable' ? t('panel.unavailable')
    : block === 'disabled' ? t('panel.disabled')
      : block === 'readOnly' ? t('panel.readOnly')
        : block === 'noPr' ? (typed === '' ? t('panel.noPr', { key: taskKey || 'WEB-12' }) : '')
          : '';
  const hasCriteria = (task.acceptanceCriteria?.length ?? 0) > 0;

  const optionLabel = (link: TaskLink) => link.title
    ? t('panel.pr.option', { number: link.number ?? '', title: link.title })
    : t('panel.pr.optionNoTitle', { number: link.number ?? '' });
  const options = [
    ...links.map(link => ({ value: link.url, label: optionLabel(link) })),
    { value: OTHER, label: t('panel.pr.other') },
  ];

  const run = async () => {
    setRunError('');
    try {
      await reviews.start(choice === OTHER ? typed : choice);
    } catch (err) {
      setRunError((err as Error).message);
    }
  };

  return (
    <section aria-label={t('panel.title')} className="space-y-3">
      <div>
        <h3 className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">
          <Bot className="size-3.5" aria-hidden /> {t('panel.title')}
        </h3>
        <p className="mt-0.5 text-sm text-slate-600">{t('panel.subtitle')}</p>
      </div>

      {settingsError ? (
        <div className="space-y-2">
          <Alert tone="error">{settingsError}</Alert>
          <Button type="button" variant="outline" onClick={reloadSettings} className="h-10 border-slate-300 text-slate-700 sm:h-9">{t('panel.retry')}</Button>
        </div>
      ) : (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3 sm:p-4">
          <div className="space-y-2">
            {links.length > 0 && (
              <div>
                <p id={`${urlId}-label`} className="mb-1 text-xs font-medium text-slate-700">{t('panel.pr.label')}</p>
                <Select value={choice} onValueChange={value => value && setPicked(value)} items={options}>
                  <SelectTrigger aria-labelledby={`${urlId}-label`} className="h-11 w-full border-slate-300 bg-white text-sm text-slate-800 shadow-none sm:h-9">
                    <SelectValue>{() => options.find(option => option.value === choice)?.label ?? ''}</SelectValue>
                  </SelectTrigger>
                  <SelectContent alignItemWithTrigger={false}>
                    {options.map(option => (
                      <SelectItem key={option.value} value={option.value} className="text-slate-700">{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {choice === OTHER && (
              <div>
                <label htmlFor={urlId} className="mb-1 block text-xs font-medium text-slate-700">{t('panel.pr.urlLabel')}</label>
                <Input
                  id={urlId}
                  type="url"
                  dir="ltr"
                  inputMode="url"
                  value={customUrl}
                  onChange={event => setCustomUrl(event.target.value)}
                  placeholder={t('panel.pr.urlPlaceholder')}
                  aria-invalid={urlInvalid || undefined}
                  aria-describedby={urlInvalid ? `${urlId}-error` : undefined}
                  maxLength={300}
                  className="h-11 rounded-lg border border-slate-300 bg-white text-base text-slate-900 shadow-none placeholder:text-slate-500 focus-visible:border-slate-400 focus-visible:ring-0 sm:h-9 sm:text-sm"
                />
                {urlInvalid && <p id={`${urlId}-error`} className="mt-1 text-xs text-danger-fg">{t('panel.pr.urlInvalid')}</p>}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              disabled={block !== null || busy || settingsLoading}
              aria-describedby={blockedMessage ? hintId : undefined}
              onClick={() => { void run(); }}
              className="h-11 gap-1.5 bg-primary px-4 text-white hover:bg-primary-hover sm:h-9"
            >
              {busy ? <Spinner decorative /> : shown ? <RotateCw aria-hidden /> : <Play aria-hidden />}
              {reviews.starting ? t('panel.starting') : busy ? t('panel.runningShort') : shown ? t('panel.rerun') : t('panel.run')}
            </Button>
            {(block === 'disabled' || block === 'unavailable') && canManage && !settingsLoading && (
              <Link to={`/${workspaceSlug}/settings`} className="text-sm font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-primary">
                {t('panel.openSettings')}
              </Link>
            )}
          </div>
          {blockedMessage && (
            <p id={hintId} className="text-sm text-slate-600">
              {blockedMessage}{' '}
              {block === 'disabled' && canManage
                ? t('panel.disabledManage')
                : block === 'unavailable' && canManage
                  ? t('panel.unavailableManage')
                  : ''}
            </p>
          )}
          {!blockedMessage && !hasCriteria && block === null && <p className="text-xs text-slate-600">{t('panel.noCriteria')}</p>}
          {runError && <Alert tone="error" onDismiss={() => setRunError('')}>{runError}</Alert>}
        </div>
      )}

      {reviews.error ? (
        <div className="space-y-2">
          <Alert tone="error">{reviews.error}</Alert>
          <Button type="button" variant="outline" onClick={reviews.reload} className="h-10 border-slate-300 text-slate-700 sm:h-9">{t('panel.retry')}</Button>
        </div>
      ) : reviews.loading ? (
        <p role="status" className="flex items-center gap-2 text-sm text-slate-600"><Spinner decorative />{t('panel.loading')}</p>
      ) : !shown ? (
        <p className="text-sm text-slate-600">{t('panel.empty')}</p>
      ) : isActive(shown) ? (
        <div role="status" className="flex items-start gap-2.5 rounded-lg border border-info-border bg-info-bg p-3 text-sm text-info-fg">
          <Spinner decorative />
          <p>{t(`panel.progress.${shown.status === 'queued' ? 'queued' : 'running'}`)}</p>
        </div>
      ) : shown.status === 'failed' ? (
        <Alert tone="error" title={t('panel.failed.title')}>{shown.error || t('panel.failed.fallback')}</Alert>
      ) : (
        <ReviewResult review={shown} />
      )}

      <ReviewHistory reviews={reviews.reviews} shownId={shown?._id ?? null} onSelect={reviews.select} />
    </section>
  );
};

export default AiReviewPanel;
