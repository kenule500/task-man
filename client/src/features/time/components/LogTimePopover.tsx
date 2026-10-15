import { useId, useState, type FormEvent } from 'react';
import { Plus } from 'lucide-react';
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
      setError('Enter a duration such as 1h 30m, 45m or 1:30.');
      return;
    }
    if (minutes > MAX_ENTRY_MINUTES) {
      setError('A single entry can be at most 24 hours. Split longer work across days.');
      return;
    }
    if (!day || day > todayKey()) {
      setError('Pick today or an earlier day.');
      return;
    }
    setError('');
    setSaving(true);
    try {
      const startedAt = loggedAtFor(day);
      await onLog({ minutes, ...(startedAt ? { startedAt } : {}), ...(note.trim() ? { note: note.trim() } : {}) });
      toast.success('Time logged');
      setOpen(false);
      reset();
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not log the time. Check your connection and try again.'));
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
            <Plus className="size-4" aria-hidden /> Log time
          </Button>
        }
      />
      <PopoverContent aria-label="Log time" width="lg" className="max-w-[calc(100vw-1.5rem)]">
        <form onSubmit={event => { void submit(event); }} className="space-y-3" noValidate>
          <Field label="Time spent" htmlFor={durationId} required error={error || undefined} hint={error ? undefined : 'For example 1h 30m, 45m or 1:30.'}>
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
          <Field label="Day" htmlFor={`${id}-day`}>
            <Input
              id={`${id}-day`}
              type="date"
              value={day}
              max={todayKey()}
              onChange={event => setDay(event.target.value)}
              className="h-11 text-base md:h-9 md:text-sm"
            />
          </Field>
          <Field label="Note" htmlFor={`${id}-note`} hint="Optional.">
            <Input
              id={`${id}-note`}
              value={note}
              maxLength={NOTE_MAX}
              onChange={event => setNote(event.target.value)}
              placeholder="What did you work on?"
              autoComplete="off"
              className="h-11 text-base md:h-9 md:text-sm"
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} className="h-10 sm:h-9">Cancel</Button>
            <Button type="submit" loading={saving} className="h-10 bg-primary text-white hover:bg-primary-hover sm:h-9">Log time</Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
};

export default LogTimePopover;
