// Pure helpers for time tracking: durations, date-range parsing, totals and CSV cells.

export const MAX_ENTRY_MINUTES = 1440;
const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 86_400_000;
// A timer left running is counted for at most a day
export const MAX_TIMER_MINUTES = MAX_ENTRY_MINUTES;

/** Whole minutes between two instants, at least 1 (a timer stopped at once still counts a minute), at most `cap`. */
export const minutesBetween = (start: Date, end: Date, cap = MAX_TIMER_MINUTES): number => {
  const raw = Math.round((end.getTime() - start.getTime()) / MS_PER_MINUTE);
  return Math.min(cap, Math.max(1, raw));
};

/** Where a running timer ends when stopped at `now`: never more than the cap after it started. */
export const timerEnd = (start: Date, now: Date, cap = MAX_TIMER_MINUTES): Date =>
  new Date(Math.min(now.getTime(), start.getTime() + cap * MS_PER_MINUTE));

/** UTC calendar day of an instant as YYYY-MM-DD. */
export const dayKey = (value: Date): string => value.toISOString().slice(0, 10);

const DAY_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Reads a `from` / `to` query value. A bare YYYY-MM-DD is a UTC calendar day (`to` includes the whole day);
 * a full ISO date-time is used as is. Anything else gives null.
 */
export const parseRangeBound = (value: unknown, kind: 'from' | 'to'): Date | null => {
  if (typeof value !== 'string' || value.length === 0 || value.length > 40) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  if (DAY_ONLY.test(value) && kind === 'to') return new Date(date.getTime() + MS_PER_DAY - 1);
  return date;
};

export interface TimeRow {
  userId: string;
  taskId: string;
  startedAt: Date;
  minutes: number;
}

export interface TimeTotals {
  minutes: number;
  byUser: { user: string; minutes: number }[];
  byDay: { day: string; minutes: number }[];
  byTask: { task: string; minutes: number }[];
}

/** Adds minutes per key, biggest first (days oldest first). */
const sumBy = <K extends string>(rows: TimeRow[], keyOf: (row: TimeRow) => string, name: K) => {
  const totals = new Map<string, number>();
  for (const row of rows) totals.set(keyOf(row), (totals.get(keyOf(row)) ?? 0) + row.minutes);
  return [...totals].map(([key, minutes]) => ({ [name]: key, minutes }) as Record<K, string> & { minutes: number });
};

/** Totals overall and per user, UTC day and task. */
export const summarizeEntries = (rows: TimeRow[]): TimeTotals => ({
  minutes: rows.reduce((sum, row) => sum + row.minutes, 0),
  byUser: sumBy(rows, row => row.userId, 'user').sort((a, b) => b.minutes - a.minutes),
  byDay: sumBy(rows, row => dayKey(row.startedAt), 'day').sort((a, b) => a.day.localeCompare(b.day)),
  byTask: sumBy(rows, row => row.taskId, 'task').sort((a, b) => b.minutes - a.minutes),
});

/** "2h 30m", "45m", "3h"; "0m" for nothing. */
export const formatMinutes = (minutes: number): string => {
  const total = Math.max(0, Math.round(minutes));
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  if (hours === 0) return `${rest}m`;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
};

/** One RFC 4180 field: quoted, quotes doubled, and text a spreadsheet could run as a formula gets an apostrophe. */
export const csvCell = (value: unknown): string => {
  let text = value === undefined || value === null ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
};

export const toCsvRows = (rows: unknown[][]): string =>
  rows.map(row => row.map(csvCell).join(',')).join('\r\n') + (rows.length ? '\r\n' : '');
