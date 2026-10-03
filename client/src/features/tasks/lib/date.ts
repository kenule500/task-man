// Date-only helpers. Tasks are scheduled by calendar day, so every value is
// handled as a local date (no time, no timezone drift) and keyed `YYYY-MM-DD`.

export const DAY_MS = 24 * 60 * 60 * 1000;

const pad = (value: number) => String(value).padStart(2, '0');

/** `Date` -> `YYYY-MM-DD` using local calendar fields. */
export const toDateKey = (date: Date): string =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/** ISO string or `YYYY-MM-DD` -> local midnight `Date` of that calendar day. */
export const parseDateKey = (value: string): Date => {
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  return new Date(year, month - 1, day);
};

/** Normalizes an API date (ISO) to its `YYYY-MM-DD` key. */
export const dateKeyOf = (value: string): string => value.slice(0, 10);

export const startOfDay = (date: Date): Date =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());

export const addDays = (date: Date, amount: number): Date =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + amount);

export const addMonths = (date: Date, amount: number): Date =>
  new Date(date.getFullYear(), date.getMonth() + amount, 1);

export const startOfMonth = (date: Date): Date => new Date(date.getFullYear(), date.getMonth(), 1);

/** Whole calendar days from `a` to `b` (DST safe). */
export const diffInDays = (a: Date, b: Date): number =>
  Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / DAY_MS);

export const isSameDay = (a: Date, b: Date): boolean => toDateKey(a) === toDateKey(b);

export const isWeekend = (date: Date): boolean => date.getDay() === 0 || date.getDay() === 6;

export const todayKey = (): string => toDateKey(new Date());

export const formatDate = (value: string, options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }) =>
  parseDateKey(value).toLocaleDateString('en-US', options);

export const formatMonth = (date: Date): string =>
  date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

/** True when the due date is before today and the task is not done. */
export const isOverdue = (deadline: string, completed: boolean): boolean =>
  !completed && dateKeyOf(deadline) < todayKey();
