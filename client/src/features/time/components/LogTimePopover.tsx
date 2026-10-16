import { useId, useState, type FormEvent } from 'react';
import { Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Field, fieldMessageId, toast } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { todayKey } from '@/features/tasks/lib/date';
import { getApiErrorMessage } from '../api';
import { MAX_ENTRY_MINUTES, parseDuration } from '../lib/duration';
import { loggedAtFor } from '../lib/timesheet';
import type { LogTimeInput } from '../types';

interface LogTimePopoverProps {
  onLog: (input: LogTimeInput) => Promise<void>;
  disabled?: boolean;
}

const NOTE_MAX = 200;

/** "Log time" button with a small form: duration ("1h 30m"), the day it was worked and an optional note. */
const LogTimePopover = ({ onLog, disabled }: LogTimePopoverProps) => {
  const { t } = useTranslation('tasks');
  const id = useId();
  const [open, setOpen] = useState(false);
  const [duration, setDuration] = useState('');
  const [day, setDay] = useState(() => todayKey());
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setDuration('');
    setDay(todayKey());
    setNote('');
    setError('');
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    const minutes = parseDuration(duration);
    if (minutes === null || minutes < 1) {
      setError(t('time.logInvalid'));
      return;
    }
    if (minutes > MAX_ENTRY_MINUTES) {
      setError(t('time.logTooLong'));
      return;
    }
    if (!day || day > todayKey()) {
      setError(t('time.logDay'));
      return;
    }
    setError('');
    setSaving(true);
    try {
      const startedAt = loggedAtFor(day);
      await onLog({ minutes, ...(startedAt ? { startedAt } : {}), ...(note.trim() ? { note: note.trim() } : {}) });
      toast.success(t('time.logged'));
      setOpen(false);
      reset();
    } catch (err) {
      setError(getApiErrorMessage(err, t('time.logError')));
    } finally {
      setSaving(false);
    }
  };

  const durationId = `${id}-duration`;
  return (
    <Popover open={open} onOpenChange={next => { setOpen(next); if (!next) reset(); }}>
      <PopoverTrigger
        render={
          <Button type="button" variant="outline" disabled={disabled} className="h-10 gap-1.5 border-slate-300 text-slate-700 sm:h-9">
            <Plus className="size-4" aria-hidden /> {t('time.logTime')}
          </Button>
        }
      />
      <PopoverContent aria-label={t('time.logTime')} width="lg" className="max-w-[calc(100vw-1.5rem)]">
        <form onSubmit={event => { void submit(event); }} className="space-y-3" noValidate>
          <Field label={t('time.timeSpent')} htmlFor={durationId} required error={error || undefined} hint={error ? undefined : t('time.logHint')}>
            <Input
              id={durationId}
              value={duration}
              onChange={event => { setDuration(event.target.value); setError(''); }}
              placeholder="1h 30m"
              autoComplete="off"
              aria-invalid={Boolean(error)}
              aria-describedby={fieldMessageId(durationId)}
              className="h-11 text-base md:h-9 md:text-sm"
            />
          </Field>
          <Field label={t('time.day')} htmlFor={`${id}-day`}>
            <Input
              id={`${id}-day`}
              type="date"
              value={day}
              max={todayKey()}
              onChange={event => setDay(event.target.value)}
              className="h-11 text-base md:h-9 md:text-sm"
            />
          </Field>
          <Field label={t('time.note')} htmlFor={`${id}-note`} hint={t('time.optional')}>
            <Input
              id={`${id}-note`}
              value={note}
              maxLength={NOTE_MAX}
              onChange={event => setNote(event.target.value)}
              placeholder={t('time.notePlaceholder')}
              autoComplete="off"
              className="h-11 text-base md:h-9 md:text-sm"
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} className="h-10 sm:h-9">{t('actions.cancel')}</Button>
            <Button type="submit" loading={saving} className="h-10 bg-primary text-white hover:bg-primary-hover sm:h-9">{t('time.logTime')}</Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
};

export default LogTimePopover;
