// Week helpers for the phone calendar: a 7-day strip (Sunday first, like the
// month grid), the default selected day and the "start → due" label.
import { addDays, formatDate, isSameDay, parseDateKey, startOfDay, startOfMonth, toDateKey, dateKeyOf } from './date';
import type { Task } from '../types';

export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export interface WeekDay {
  date: Date;
  /** `YYYY-MM-DD` */
  key: string;
  /** `Sun`..`Sat` */
  weekday: string;
  /** Day of the month, 1-31 */
  dayOfMonth: number;
  isToday: boolean;
  /** Tasks due that day */
  count: number;
}

/** The Sunday that starts the week containing `date`. */
export const startOfWeek = (date: Date): Date => addDays(startOfDay(date), -date.getDay());

/** Seven days of the week containing `anchor`, with how many tasks are due on each. */
export const buildWeek = (
  anchor: Date,
  tasksByDay: ReadonlyMap<string, readonly unknown[]> = new Map(),
  today = new Date(),
): WeekDay[] => {
  const start = startOfWeek(anchor);

  return Array.from({ length: 7 }, (_, index) => {
    const date = addDays(start, index);
    const key = toDateKey(date);
    return {
      date,
      key,
      weekday: WEEKDAYS[date.getDay()],
      dayOfMonth: date.getDate(),
      isToday: isSameDay(date, today),
      count: tasksByDay.get(key)?.length ?? 0,
    };
  });
};

/** Moves a `YYYY-MM-DD` key by whole weeks (negative = back). */
export const shiftWeek = (key: string, weeks: number): string => toDateKey(addDays(parseDateKey(key), weeks * 7));

/** Day selected when a month is shown: today if it is in that month, else the 1st. */
export const defaultSelectedKey = (month: Date, today = new Date()): string => {
  const first = startOfMonth(month);
  const inMonth = today.getFullYear() === first.getFullYear() && today.getMonth() === first.getMonth();
  return toDateKey(inMonth ? today : first);
};

/** "Oct 3 → Oct 10" for tasks with a start date; a single date when it is a one-day task; null without a start. */
export const formatTaskRange = (task: Pick<Task, 'startDate' | 'deadline'>): string | null => {
  if (!task.startDate) return null;
  const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  const start = dateKeyOf(task.startDate);
  const due = dateKeyOf(task.deadline);
  return start === due ? formatDate(due, options) : `${formatDate(start, options)} → ${formatDate(due, options)}`;
};
