import { useContext, useId, useState, type KeyboardEvent } from 'react';
import { Play, Square, Timer, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Alert, Field, SectionHeader, UserAvatar, fieldMessageId, toast } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { PermissionContext } from '@/context/PermissionContext';
import { formatDate } from '@/features/tasks/lib/date';
import { cn } from '@/lib/utils';
import { getApiErrorMessage } from '../api';
import { useRunningTimer, useNow } from '../hooks/useRunningTimer';
import { useTaskTime } from '../hooks/useTaskTime';
import { MAX_ESTIMATE_MINUTES, describeDuration, formatDuration, formatElapsed, parseDuration } from '../lib/duration';
import { localDayKey } from '../lib/timesheet';
import { startTimer, stopTimer } from '../timerStore';
import type { TimeEntry } from '../types';
import LogTimePopover from './LogTimePopover';
import TimeProgressBar from './TimeProgressBar';

interface TaskTimeSectionProps {
  workspaceSlug: string | undefined;
  taskId: string;
  /** Estimate stored on the task (from the live task list). */
  estimateMinutes: number | null | undefined;
  currentUserId?: string;
  /** Holds `tasks:write`: log time, run the timer, delete own entries. */
  canWrite: boolean;
  /** Can change the task's fields (the estimate). */
  canEditEstimate: boolean;
  onEstimateChange?: (minutes: number | null) => Promise<unknown> | void;
}

interface EstimateFieldProps {
  value: number | null | undefined;
  disabled: boolean;
  onCommit: (minutes: number | null) => Promise<unknown> | void;
}

/** Estimate box: "2h 30m" on blur or Enter; empty clears it. */
const EstimateField = ({ value, disabled, onCommit }: EstimateFieldProps) => {
  const { t } = useTranslation('tasks');
  const id = useId();
  const [draft, setDraft] = useState(value ? formatDuration(value) : '');
  const [error, setError] = useState('');

  const commit = async () => {
    const text = draft.trim();
    const minutes = text === '' ? null : parseDuration(text);
    if (text !== '' && (minutes === null || minutes > MAX_ESTIMATE_MINUTES)) {
      setError(t('time.estimateInvalid'));
      return;
    }
    setError('');
    if ((minutes ?? null) === (value ?? null)) {
      setDraft(minutes ? formatDuration(minutes) : '');
      return;
    }
    try {
      await onCommit(minutes);
      setDraft(minutes ? formatDuration(minutes) : '');
    } catch (err) {
      setError(getApiErrorMessage(err, t('time.estimateSaveError')));
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void commit();
    }
    if (event.key === 'Escape' && draft !== (value ? formatDuration(value) : '')) {
      // Revert without closing the dialog
      event.stopPropagation();
      setDraft(value ? formatDuration(value) : '');
      setError('');
    }
  };

  return (
    <Field label={t('time.estimate')} htmlFor={id} error={error || undefined} hint={error || disabled ? undefined : t('time.estimateHint')} className="w-full sm:w-44">
      <Input
        id={id}
        value={draft}
        disabled={disabled}
        placeholder="2h 30m"
        autoComplete="off"
        aria-invalid={Boolean(error)}
        aria-describedby={error || !disabled ? fieldMessageId(id) : undefined}
        onChange={event => { setDraft(event.target.value); setError(''); }}
        onBlur={() => { void commit(); }}
        onKeyDown={onKeyDown}
        className="h-11 text-base md:h-9 md:text-sm"
      />
    </Field>
  );
};

const EntryRow = ({
  entry, canDelete, onDelete, deleting,
}: { entry: TimeEntry; canDelete: boolean; onDelete: (entry: TimeEntry) => void; deleting: boolean }) => {
  const { t } = useTranslation('tasks');
  return (
  <li className="flex min-h-11 items-start gap-2.5 px-3 py-2">
    <UserAvatar name={entry.user.name} src={entry.user.avatarUrl || undefined} size="sm" className="mt-0.5 size-6 text-[10px]" />
    <div className="min-w-0 flex-1">
      <p className="flex flex-wrap items-baseline gap-x-2 text-sm text-slate-900">
        <span className="font-medium tabular-nums">
          {entry.running ? t('time.runningNow') : formatDuration(entry.minutes)}
          {!entry.running && <span className="sr-only"> ({describeDuration(entry.minutes)})</span>}
        </span>
        <span className="truncate text-slate-600">{entry.user.name}</span>
        <time dateTime={entry.startedAt} className="text-xs text-slate-500 tabular-nums">{formatDate(localDayKey(entry.startedAt))}</time>
      </p>
      {entry.note && <p className="text-sm text-slate-600 [overflow-wrap:anywhere]">{entry.note}</p>}
    </div>
    {canDelete && (
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        disabled={deleting}
        onClick={() => onDelete(entry)}
        aria-label={t('time.deleteEntry', { what: entry.running ? t('time.runningTimer') : formatDuration(entry.minutes), name: entry.user.name })}
        className="size-9 shrink-0 text-slate-500 hover:bg-danger-bg hover:text-danger-fg sm:size-7"
      >
        <Trash2 className="size-4" aria-hidden />
      </Button>
    )}
  </li>
  );
};

/** Time section of the task dialog: estimate, logged vs estimate, timer, manual logging and the entries. */
const TaskTimeSection = ({
  workspaceSlug, taskId, estimateMinutes, currentUserId, canWrite, canEditEstimate, onEstimateChange,
}: TaskTimeSectionProps) => {
  const { t } = useTranslation('tasks');
  const permissions = useContext(PermissionContext);
  const canManage = permissions?.can('settings:manage') ?? false;
  const { data, loading, error, retry, log, remove } = useTaskTime(workspaceSlug, taskId);
  const { timer } = useRunningTimer(workspaceSlug);
  const runningHere = timer?.task._id === taskId;
  const now = useNow(runningHere);
  const [busy, setBusy] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  if (!workspaceSlug) return null;

  const toggleTimer = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (runningHere) {
        await stopTimer(workspaceSlug, taskId);
        toast.success(t('time.timerStopped'));
      } else {
        await startTimer(workspaceSlug, taskId);
        toast.success(timer ? t('time.timerMoved', { from: timer.task.key || timer.task.title }) : t('time.timerStarted'));
      }
    } catch (err) {
      toast.error(getApiErrorMessage(err, runningHere ? t('time.stopError') : t('time.startError')));
    } finally {
      setBusy(false);
    }
  };

  const deleteEntry = async (entry: TimeEntry) => {
    setDeletingId(entry._id);
    try {
      await remove(entry._id);
      toast.success(t('time.entryDeleted'));
    } catch (err) {
      toast.error(getApiErrorMessage(err, t('time.entryDeleteError')));
    } finally {
      setDeletingId(null);
    }
  };

  const estimate = data?.estimateMinutes ?? estimateMinutes ?? null;
  const logged = data?.loggedMinutes ?? 0;
  const entries = data?.entries ?? [];
  const elapsed = runningHere && timer ? now - new Date(timer.startedAt).getTime() : 0;

  return (
    <section aria-label={t('time.section')}>
      <SectionHeader title={t('time.section')} icon={<Timer className="size-4 text-slate-500" aria-hidden />} className="mb-2" />

      {error && !data && (
        <Alert tone="error" title={t('time.loadFailed')} className="mb-2">
          <Button type="button" variant="link" onClick={retry} className="h-auto p-0">{t('actions.retry')}</Button>
        </Alert>
      )}

      {loading ? (
        <div role="status" aria-busy="true" className="space-y-2">
          <span className="sr-only">{t('time.loadingEntries')}</span>
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <EstimateField
              key={String(estimate)}
              value={estimate}
              disabled={!canEditEstimate || !onEstimateChange}
              onCommit={minutes => onEstimateChange?.(minutes)}
            />
            {canWrite && (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant={runningHere ? 'destructive' : 'outline'}
                  loading={busy}
                  onClick={() => { void toggleTimer(); }}
                  className={cn('h-10 gap-1.5 sm:h-9', !runningHere && 'border-slate-300 text-slate-700')}
                >
                  {runningHere ? <Square className="size-4" aria-hidden /> : <Play className="size-4" aria-hidden />}
                  {runningHere ? (
                    <>
                      {t('time.stopTimer')} <span className="tabular-nums" aria-hidden>{formatElapsed(elapsed)}</span>
                      <span className="sr-only">{t('time.runningFor', { duration: describeDuration(Math.floor(elapsed / 60_000)) })}</span>
                    </>
                  ) : t('time.startTimer')}
                </Button>
                <LogTimePopover onLog={log} />
              </div>
            )}
          </div>

          <TimeProgressBar logged={logged} estimate={estimate} />

          {entries.length === 0 ? (
            <p className="text-sm text-slate-500">{t('time.noneLogged')}</p>
          ) : (
            <ul aria-label={t('time.entriesList')} className="divide-y divide-slate-100 rounded-lg border border-slate-200">
              {entries.map(entry => (
                <EntryRow
                  key={entry._id}
                  entry={entry}
                  canDelete={canWrite && (entry.user._id === currentUserId || canManage)}
                  deleting={deletingId === entry._id}
                  onDelete={entry => { void deleteEntry(entry); }}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
};

export default TaskTimeSection;
