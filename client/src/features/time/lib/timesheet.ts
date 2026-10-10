import { addDays, parseDateKey, startOfDay, toDateKey } from '@/features/tasks/lib/date';
import type { SheetEntry, TimeTask } from '../types';

/** Monday of the week containing `date` (local time). */
export const startOfIsoWeek = (date: Date): Date => {
  const day = startOfDay(date);
  return addDays(day, -((day.getDay() + 6) % 7));
};

/** The seven day keys (Monday first) of the week starting at `startKey`. */
export const weekDayKeys = (startKey: string): string[] =>
  Array.from({ length: 7 }, (_, index) => toDateKey(addDays(parseDateKey(startKey), index)));

export const shiftWeekStart = (startKey: string, weeks: number): string =>
  toDateKey(addDays(parseDateKey(startKey), weeks * 7));

/** ISO instants bounding the local week: from midnight Monday up to the last millisecond of Sunday. */
export const weekRange = (startKey: string): { from: string; to: string } => {
  const start = parseDateKey(startKey);
  return {
    from: start.toISOString(),
    to: new Date(addDays(start, 7).getTime() - 1).toISOString(),
  };
};

/** The local calendar day an instant falls on. */
export const localDayKey = (iso: string): string => toDateKey(new Date(iso));

export interface GridRow {
  task: TimeTask;
  /** Minutes per day, aligned with the grid's days. */
  minutes: number[];
  total: number;
}

export interface WeekGrid {
  days: string[];
  rows: GridRow[];
  dayTotals: number[];
  total: number;
}

/** Tasks as rows and days as columns; entries outside the days are ignored. Rows are ordered by key, then title. */
export const buildWeekGrid = (entries: readonly SheetEntry[], days: readonly string[]): WeekGrid => {
  const index = new Map(days.map((day, position) => [day, position]));
  const rows = new Map<string, GridRow>();
  const dayTotals = days.map(() => 0);
  for (const entry of entries) {
    const position = index.get(localDayKey(entry.startedAt));
    if (position === undefined) continue;
    let row = rows.get(entry.task._id);
    if (!row) {
      row = { task: entry.task, minutes: days.map(() => 0), total: 0 };
      rows.set(entry.task._id, row);
    }
    row.minutes[position] += entry.minutes;
    row.total += entry.minutes;
    dayTotals[position] += entry.minutes;
  }
  const ordered = [...rows.values()].sort(
    (a, b) => a.task.key.localeCompare(b.task.key, undefined, { numeric: true }) || a.task.title.localeCompare(b.task.title),
  );
  return { days: [...days], rows: ordered, dayTotals, total: dayTotals.reduce((sum, minutes) => sum + minutes, 0) };
};

/** Start of an entry logged by hand on `dayKey`: undefined (just now) for today, otherwise noon that day. */
export const loggedAtFor = (dayKey: string, now: Date = new Date()): string | undefined => {
  if (dayKey === toDateKey(now)) return undefined;
  const day = parseDateKey(dayKey);
  day.setHours(12, 0, 0, 0);
  return day.toISOString();
};
