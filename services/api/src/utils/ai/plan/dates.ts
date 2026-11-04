// Calendar days as "YYYY-MM-DD" strings, computed in UTC so a day never shifts with the server's time zone.

const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

export const isDateKey = (value: unknown): value is string => {
  if (typeof value !== 'string') return false;
  const match = DATE_KEY.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};

export const dayToDate = (key: string): Date => new Date(`${key}T00:00:00.000Z`);

export const toDateKey = (date: Date): string => date.toISOString().slice(0, 10);

export const addDays = (key: string, days: number): string => toDateKey(new Date(dayToDate(key).getTime() + days * DAY_MS));

/** The first Monday after `from` (a Monday gives the Monday a week later), so the first sprint always starts in the future. */
export const nextMonday = (from: Date = new Date()): string => {
  const today = toDateKey(from);
  const weekday = dayToDate(today).getUTCDay();
  return addDays(today, ((8 - weekday) % 7) || 7);
};

/**
 * Dates of the `index`-th sprint (0-based): sprints follow each other without a gap. A sprint that starts on a Monday ends
 * on the Friday of its last week; any other start gives a sprint that ends the day before the next one would start.
 */
export const sprintWindow = (start: string, weeks: number, index: number): { startDate: string; endDate: string } => {
  const startDate = addDays(start, index * weeks * 7);
  const monday = dayToDate(startDate).getUTCDay() === 1;
  return { startDate, endDate: addDays(startDate, weeks * 7 - (monday ? 3 : 1)) };
};
