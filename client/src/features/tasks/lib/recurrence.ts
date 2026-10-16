import i18n from '@/i18n';
import type { RecurrenceBasis, RecurrenceUnit, TaskRecurrence } from '../types';

export const MAX_RECURRENCE_EVERY = 365;

/** Labels are resolved when read, so they follow the active language. */
export const RECURRENCE_UNIT_OPTIONS: { value: RecurrenceUnit; singular: string; plural: string }[] = [
  { value: 'day', get singular() { return i18n.t('tasks:recurrence.unit.day_one'); }, get plural() { return i18n.t('tasks:recurrence.unit.day_other'); } },
  { value: 'week', get singular() { return i18n.t('tasks:recurrence.unit.week_one'); }, get plural() { return i18n.t('tasks:recurrence.unit.week_other'); } },
  { value: 'month', get singular() { return i18n.t('tasks:recurrence.unit.month_one'); }, get plural() { return i18n.t('tasks:recurrence.unit.month_other'); } },
];

export const RECURRENCE_BASIS_OPTIONS: { value: RecurrenceBasis; label: string }[] = [
  { value: 'due', get label() { return i18n.t('tasks:recurrence.basis.due'); } },
  { value: 'completion', get label() { return i18n.t('tasks:recurrence.basis.completion'); } },
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
  if (!recurrence) return i18n.t('tasks:recurrence.none');
  const basis = RECURRENCE_BASIS_OPTIONS.find(option => option.value === recurrence.basis)?.label ?? recurrence.basis;
  return i18n.t('tasks:recurrence.describe', { every: everyPhrase(recurrence), basis });
};

const everyPhrase = (recurrence: TaskRecurrence): string =>
  i18n.t(`tasks:recurrence.every.${recurrence.unit}`, { count: recurrence.every, defaultValue: String(recurrence.unit) });

/** Badge text: "every 2 weeks". */
export const shortRecurrence = (recurrence: TaskRecurrence): string => everyPhrase(recurrence).toLowerCase();

/** Only top-level work items can repeat (subtasks follow their parent, epics are containers). */
export const canRepeat = (task: { parent?: string | null; type?: string }): boolean => !task.parent && task.type !== 'epic';
