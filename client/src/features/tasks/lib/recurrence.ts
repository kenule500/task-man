import type { RecurrenceBasis, RecurrenceUnit, TaskRecurrence } from '../types';

export const MAX_RECURRENCE_EVERY = 365;

export const RECURRENCE_UNIT_OPTIONS: { value: RecurrenceUnit; singular: string; plural: string }[] = [
  { value: 'day', singular: 'day', plural: 'days' },
  { value: 'week', singular: 'week', plural: 'weeks' },
  { value: 'month', singular: 'month', plural: 'months' },
];

export const RECURRENCE_BASIS_OPTIONS: { value: RecurrenceBasis; label: string }[] = [
  { value: 'due', label: 'from due date' },
  { value: 'completion', label: 'from completion' },
];

export const DEFAULT_RECURRENCE: TaskRecurrence = { every: 1, unit: 'week', basis: 'due' };

/** A whole number from 1 to 365; anything else (empty, text, decimals) is clamped or falls back to 1. */
export const clampEvery = (value: number | string): number => {
  const number = Math.trunc(Number(value));
  if (!Number.isFinite(number) || number < 1) return 1;
  return Math.min(number, MAX_RECURRENCE_EVERY);
};

/** "Every 2 weeks, from due date"; "Does not repeat" without a rule. */
export const describeRecurrence = (recurrence: TaskRecurrence | null | undefined): string => {
  if (!recurrence) return 'Does not repeat';
  const unit = RECURRENCE_UNIT_OPTIONS.find(option => option.value === recurrence.unit);
  const every = recurrence.every === 1
    ? `Every ${unit?.singular ?? recurrence.unit}`
    : `Every ${recurrence.every} ${unit?.plural ?? recurrence.unit}`;
  const basis = RECURRENCE_BASIS_OPTIONS.find(option => option.value === recurrence.basis)?.label ?? recurrence.basis;
  return `${every}, ${basis}`;
};

/** Badge text: "every 2 weeks". */
export const shortRecurrence = (recurrence: TaskRecurrence): string =>
  describeRecurrence(recurrence).split(',')[0].toLowerCase();

/** Only top-level work items can repeat (subtasks follow their parent, epics are containers). */
export const canRepeat = (task: { parent?: string | null; type?: string }): boolean => !task.parent && task.type !== 'epic';
