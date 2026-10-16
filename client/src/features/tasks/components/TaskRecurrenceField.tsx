import { useId, useState, type KeyboardEvent } from 'react';
import { Repeat } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n';
import { toast } from '@/components/ds';
import { Input } from '@/components/ui/input';
import { getApiErrorMessage } from '../api';
import type { SelectOption } from '../constants';
import {
  DEFAULT_RECURRENCE, MAX_RECURRENCE_EVERY, RECURRENCE_BASIS_OPTIONS, RECURRENCE_UNIT_OPTIONS, clampEvery, describeRecurrence,
} from '../lib/recurrence';
import type { RecurrenceBasis, RecurrenceUnit, TaskRecurrence } from '../types';
import { OptionSelect } from './TaskSelects';

export interface TaskRecurrenceFieldProps {
  value: TaskRecurrence | null | undefined;
  /** Holds `tasks:write`. Read-only text otherwise. */
  canWrite: boolean;
  /** Receives the new rule, or null for "does not repeat". */
  onChange: (value: TaskRecurrence | null) => Promise<unknown> | void;
}

type Mode = 'none' | 'repeat';

const MODE_OPTIONS: SelectOption<Mode>[] = [
  { value: 'none', get label() { return i18n.t('tasks:recurrence.none'); } },
  { value: 'repeat', get label() { return i18n.t('tasks:recurrence.repeats'); } },
];

const BASIS_OPTIONS: SelectOption<RecurrenceBasis>[] = RECURRENCE_BASIS_OPTIONS; // labels are getters: resolved per render

/** "Repeat" setting of a task: none, or every N days / weeks / months counted from the due date or the completion. */
const TaskRecurrenceField = ({ value, canWrite, onChange }: TaskRecurrenceFieldProps) => {
  const { t } = useTranslation('tasks');
  const inputId = useId();
  const [draft, setDraft] = useState<string | null>(null);

  if (!canWrite) {
    return value ? (
      <span className="inline-flex items-center gap-1.5">
        <Repeat className="size-3.5 shrink-0 text-slate-500" aria-hidden />{describeRecurrence(value)}
      </span>
    ) : <span className="text-slate-500">{describeRecurrence(value)}</span>;
  }

  const save = async (next: TaskRecurrence | null) => {
    try {
      await onChange(next);
    } catch (err) {
      toast.error(getApiErrorMessage(err, t('recurrence.saveError')));
    }
  };

  const unitOptions: SelectOption<RecurrenceUnit>[] = RECURRENCE_UNIT_OPTIONS.map(option => ({
    value: option.value,
    label: value?.every === 1 ? option.singular : option.plural,
  }));

  const commitEvery = () => {
    if (!value || draft === null) return;
    const every = clampEvery(draft);
    setDraft(null);
    if (every !== value.every) void save({ ...value, every });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitEvery();
    }
    if (event.key === 'Escape') setDraft(null);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <OptionSelect
        aria-label={t('recurrence.repeat')}
        value={value ? 'repeat' : 'none'}
        options={MODE_OPTIONS}
        onChange={mode => { void save(mode === 'repeat' ? DEFAULT_RECURRENCE : null); }}
        className="h-10 w-44 sm:h-9"
      />
      {value && (
        <>
          <label htmlFor={inputId} className="text-sm text-slate-600">{t('recurrence.everyLabel')}</label>
          <Input
            id={inputId}
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_RECURRENCE_EVERY}
            aria-label={t('recurrence.interval')}
            value={draft ?? String(value.every)}
            onChange={event => setDraft(event.target.value)}
            onBlur={commitEvery}
            onKeyDown={onKeyDown}
            className="h-10 w-20 rounded-lg border border-slate-200 bg-white text-base text-slate-900 shadow-none focus-visible:ring-0 sm:h-9 sm:text-sm"
          />
          <OptionSelect
            aria-label={t('recurrence.unit.label')}
            value={value.unit}
            options={unitOptions}
            onChange={unit => { void save({ ...value, unit }); }}
            className="h-10 w-28 sm:h-9"
          />
          <OptionSelect
            aria-label={t('recurrence.countedFrom')}
            value={value.basis}
            options={BASIS_OPTIONS}
            onChange={basis => { void save({ ...value, basis }); }}
            className="h-10 w-44 sm:h-9"
          />
        </>
      )}
    </div>
  );
};

export default TaskRecurrenceField;
