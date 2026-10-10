import { toDateKey } from '@/features/tasks/lib/date';
import { buildWeekGrid, loggedAtFor, shiftWeekStart, startOfIsoWeek, weekDayKeys, weekRange } from '../lib/timesheet';
import type { SheetEntry } from '../types';

const user = { _id: 'u1', name: 'Dan' };
const taskA = { _id: 'a', title: 'Alpha', key: 'WEB-2' };
const taskB = { _id: 'b', title: 'Beta', key: 'WEB-10' };

const at = (day: string, hour: number) => {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(year, month - 1, date, hour).toISOString();
};

const entry = (id: string, task: SheetEntry['task'], day: string, minutes: number): SheetEntry => ({
  _id: id, user, task, startedAt: at(day, 10), endedAt: at(day, 11), minutes,
});

describe('weeks', () => {
  it('starts on Monday', () => {
    expect(toDateKey(startOfIsoWeek(new Date(2030, 0, 6)))).toBe('2029-12-31');
    expect(toDateKey(startOfIsoWeek(new Date(2030, 0, 7)))).toBe('2030-01-07');
    expect(toDateKey(startOfIsoWeek(new Date(2030, 0, 9, 23, 59)))).toBe('2030-01-07');
  });

  it('lists seven days and shifts by weeks', () => {
    expect(weekDayKeys('2030-01-07')).toEqual([
      '2030-01-07', '2030-01-08', '2030-01-09', '2030-01-10', '2030-01-11', '2030-01-12', '2030-01-13',
    ]);
    expect(shiftWeekStart('2030-01-07', -1)).toBe('2029-12-31');
    expect(shiftWeekStart('2030-01-07', 2)).toBe('2030-01-21');
  });

  it('bounds the week in local time', () => {
    const { from, to } = weekRange('2030-01-07');
    expect(new Date(from).getTime()).toBe(new Date(2030, 0, 7).getTime());
    expect(new Date(to).getTime()).toBe(new Date(2030, 0, 14).getTime() - 1);
  });
});

describe('buildWeekGrid', () => {
  const days = weekDayKeys('2030-01-07');

  it('puts tasks in rows and days in columns with totals', () => {
    const grid = buildWeekGrid([
      entry('1', taskB, '2030-01-08', 30),
      entry('2', taskA, '2030-01-07', 60),
      entry('3', taskA, '2030-01-07', 15),
      entry('4', taskA, '2030-01-09', 45),
    ], days);
    expect(grid.rows.map(row => row.task.key)).toEqual(['WEB-2', 'WEB-10']);
    expect(grid.rows[0].minutes).toEqual([75, 0, 45, 0, 0, 0, 0]);
    expect(grid.rows[0].total).toBe(120);
    expect(grid.rows[1].minutes).toEqual([0, 30, 0, 0, 0, 0, 0]);
    expect(grid.dayTotals).toEqual([75, 30, 45, 0, 0, 0, 0]);
    expect(grid.total).toBe(150);
  });

  it('ignores entries outside the week and is empty without entries', () => {
    const grid = buildWeekGrid([entry('1', taskA, '2030-01-20', 30)], days);
    expect(grid.rows).toEqual([]);
    expect(grid.total).toBe(0);
    expect(buildWeekGrid([], days).dayTotals).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });
});

describe('loggedAtFor', () => {
  it('means "now" for today and noon for another day', () => {
    const now = new Date(2030, 0, 9, 15, 30);
    expect(loggedAtFor('2030-01-09', now)).toBeUndefined();
    const earlier = new Date(loggedAtFor('2030-01-07', now) as string);
    expect(toDateKey(earlier)).toBe('2030-01-07');
    expect(earlier.getHours()).toBe(12);
  });
});
