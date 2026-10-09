// Agenda: the phone alternative to the month grid. Lists only the days of one
// month that have tasks, in date order.
import { isSameDay, parseDateKey, startOfMonth, toDateKey } from './date';
import { groupByDeadline } from './schedule';
import type { Task } from '../types';

export interface AgendaDay {
  /** `YYYY-MM-DD` */
  key: string;
  date: Date;
  isToday: boolean;
  tasks: Task[];
}

/** Days of `month` that have at least one task due, ascending, with tasks in their given order. */
export const buildAgenda = (tasks: Task[], month: Date, today = new Date()): AgendaDay[] => {
  const first = startOfMonth(month);

  return [...groupByDeadline(tasks)]
    .map(([key, dayTasks]) => ({ key, date: parseDateKey(key), tasks: dayTasks }))
    .filter(({ date }) => date.getFullYear() === first.getFullYear() && date.getMonth() === first.getMonth())
    .sort((a, b) => a.key.localeCompare(b.key))
    .map(day => ({ ...day, isToday: isSameDay(day.date, today) }));
};

/**
 * Agenda of `month` for the "Upcoming" list: when `month` is the current month, days
 * before today are dropped; other months are listed in full.
 */
export const buildUpcoming = (tasks: Task[], month: Date, today = new Date()): AgendaDay[] => {
  const first = startOfMonth(month);
  const isCurrent = today.getFullYear() === first.getFullYear() && today.getMonth() === first.getMonth();
  const todayKey = toDateKey(today);
  return buildAgenda(tasks, month, today).filter(day => !isCurrent || day.key >= todayKey);
};
