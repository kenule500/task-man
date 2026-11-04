// Pure date math and validation for recurring tasks. Dates are calendar days, so everything runs in UTC.

export const RECURRENCE_UNITS = ['day', 'week', 'month'] as const;
export const RECURRENCE_BASES = ['due', 'completion'] as const;
export const MAX_RECURRENCE_EVERY = 365;

export type RecurrenceUnit = (typeof RECURRENCE_UNITS)[number];
export type RecurrenceBasis = (typeof RECURRENCE_BASES)[number];

export interface Recurrence {
  every: number;
  unit: RecurrenceUnit;
  /** 'due': next dates follow the old due date; 'completion': they follow the day it was completed. */
  basis: RecurrenceBasis;
}

export interface TaskDates {
  startDate?: Date | null;
  deadline: Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Why a request value is not a valid recurrence, or null when it is one (null/undefined clear it). */
export const recurrenceProblem = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  if (!isPlainObject(value)) return 'Repeat must be an object';
  const { every, unit, basis } = value;
  if (typeof every !== 'number' || !Number.isInteger(every) || every < 1 || every > MAX_RECURRENCE_EVERY) {
    return `Repeat interval must be a whole number from 1 to ${MAX_RECURRENCE_EVERY}`;
  }
  if (typeof unit !== 'string' || !(RECURRENCE_UNITS as readonly string[]).includes(unit)) return 'Invalid repeat unit';
  if (typeof basis !== 'string' || !(RECURRENCE_BASES as readonly string[]).includes(basis)) return 'Invalid repeat basis';
  return null;
};

/** Only the known keys of a validated recurrence (call `recurrenceProblem` first). */
export const normalizeRecurrence = (value: unknown): Recurrence | null => {
  if (!isPlainObject(value)) return null;
  return { every: value.every as number, unit: value.unit as RecurrenceUnit, basis: value.basis as RecurrenceBasis };
};

const daysInMonth = (year: number, month: number): number => new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

/** Moves a date by whole days (UTC), keeping its time of day. */
export const addDays = (date: Date, days: number): Date => new Date(date.getTime() + days * DAY_MS);

/**
 * Moves a date forward by calendar months, clamping to the end of a shorter month
 * (Jan 31 + 1 month = Feb 28 or 29, never a 30-day span).
 */
export const addMonths = (date: Date, months: number): Date => {
  const index = date.getUTCFullYear() * 12 + date.getUTCMonth() + months;
  const year = Math.floor(index / 12);
  const month = ((index % 12) + 12) % 12;
  const day = Math.min(date.getUTCDate(), daysInMonth(year, month));
  return new Date(Date.UTC(
    year, month, day,
    date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds(), date.getUTCMilliseconds(),
  ));
};

/** One step of the recurrence from `date`. */
export const addInterval = (date: Date, every: number, unit: RecurrenceUnit): Date => {
  if (unit === 'month') return addMonths(date, every);
  return addDays(date, unit === 'week' ? every * 7 : every);
};

/** Midnight (UTC) of the day containing `date`. */
export const startOfUtcDay = (date: Date): Date =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

/**
 * Dates of the next occurrence. The new due date is one step after the old due date (basis 'due') or
 * after `completedOn` (basis 'completion'); the start date keeps its distance to the due date.
 */
export const nextOccurrenceDates = (
  current: TaskDates,
  recurrence: Recurrence,
  completedOn: Date = new Date(),
): { startDate: Date | undefined; deadline: Date } => {
  const from = recurrence.basis === 'completion' ? startOfUtcDay(completedOn) : current.deadline;
  const deadline = addInterval(from, recurrence.every, recurrence.unit);
  if (!current.startDate) return { startDate: undefined, deadline };
  const spanDays = Math.round((current.deadline.getTime() - current.startDate.getTime()) / DAY_MS);
  return { startDate: addDays(deadline, -Math.max(spanDays, 0)), deadline };
};

/** Short text for activity entries, e.g. "every 2 weeks from due date". */
export const describeRecurrence = (recurrence: Recurrence | null | undefined): string | undefined => {
  if (!recurrence) return undefined;
  const unit = recurrence.every === 1 ? recurrence.unit : `${recurrence.unit}s`;
  const every = recurrence.every === 1 ? `every ${recurrence.unit}` : `every ${recurrence.every} ${unit}`;
  return `${every} from ${recurrence.basis === 'due' ? 'due date' : 'completion'}`;
};
