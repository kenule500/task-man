import { MOBILE_MODE_KEY, buildWeek, defaultSelectedKey, formatTaskRange, readMobileMode, shiftWeek, startOfWeek, writeMobileMode } from '../lib/week';
import { closestColumnIndex } from '../lib/scroll';
import { groupByDeadline } from '../lib/schedule';
import { makeTask } from './fixtures';

describe('startOfWeek', () => {
  it('returns the Sunday of the week', () => {
    expect(startOfWeek(new Date(2026, 9, 14, 18)).getDate()).toBe(11); // Wed Oct 14 -> Sun Oct 11
    expect(startOfWeek(new Date(2026, 9, 11)).getDate()).toBe(11);
    expect(startOfWeek(new Date(2026, 9, 3))).toEqual(new Date(2026, 8, 27)); // crosses the month
  });
});

describe('buildWeek', () => {
  it('lists seven days Sunday to Saturday with counts and today', () => {
    const tasks = [
      makeTask({ deadline: '2026-10-14T00:00:00.000Z' }),
      makeTask({ deadline: '2026-10-14T00:00:00.000Z' }),
      makeTask({ deadline: '2026-10-17T00:00:00.000Z' }),
      makeTask({ deadline: '2026-10-25T00:00:00.000Z' }),
    ];

    const week = buildWeek(new Date(2026, 9, 14), groupByDeadline(tasks), new Date(2026, 9, 15, 9));
    expect(week.map(day => day.key)).toEqual([
      '2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17',
    ]);
    expect(week.map(day => day.weekday)).toEqual(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
    expect(week.map(day => day.count)).toEqual([0, 0, 0, 2, 0, 0, 1]);
    expect(week.filter(day => day.isToday).map(day => day.dayOfMonth)).toEqual([15]);
  });
});

describe('shiftWeek', () => {
  it('moves a date key by whole weeks across months', () => {
    expect(shiftWeek('2026-10-30', 1)).toBe('2026-11-06');
    expect(shiftWeek('2026-03-02', -1)).toBe('2026-02-23');
    expect(shiftWeek('2026-10-14', 0)).toBe('2026-10-14');
  });
});

describe('defaultSelectedKey', () => {
  it('selects today when it is in the shown month, else the 1st', () => {
    const today = new Date(2026, 9, 14);
    expect(defaultSelectedKey(new Date(2026, 9, 1), today)).toBe('2026-10-14');
    expect(defaultSelectedKey(new Date(2026, 10, 1), today)).toBe('2026-11-01');
    expect(defaultSelectedKey(new Date(2025, 9, 1), today)).toBe('2025-10-01');
  });
});

describe('formatTaskRange', () => {
  it('shows "start → due" only for tasks with a start date', () => {
    expect(formatTaskRange({ startDate: '2026-10-03', deadline: '2026-10-10T00:00:00.000Z' })).toBe('Oct 3 → Oct 10');
    expect(formatTaskRange({ startDate: '2026-10-10T00:00:00.000Z', deadline: '2026-10-10T00:00:00.000Z' })).toBe('Oct 10');
    expect(formatTaskRange({ startDate: null, deadline: '2026-10-10T00:00:00.000Z' })).toBeNull();
    expect(formatTaskRange({ deadline: '2026-10-10T00:00:00.000Z' })).toBeNull();
  });
});

describe('closestColumnIndex', () => {
  it('picks the column whose left edge is nearest the scroller edge', () => {
    expect(closestColumnIndex([0, 300, 600], 0)).toBe(0);
    expect(closestColumnIndex([-300, 20, 340], 0)).toBe(1);
    expect(closestColumnIndex([-600, -300, 40], 0)).toBe(2);
    expect(closestColumnIndex([], 0)).toBe(0);
  });
});

describe('mobile calendar mode', () => {
  it('defaults to week and reads a stored month', () => {
    expect(readMobileMode({ getItem: () => null })).toBe('week');
    expect(readMobileMode({ getItem: () => 'bogus' })).toBe('week');
    expect(readMobileMode({ getItem: key => (key === MOBILE_MODE_KEY ? 'month' : null) })).toBe('month');
    expect(readMobileMode(null)).toBe('week');
  });

  it('stores the mode and survives a failing storage', () => {
    const setItem = jest.fn();
    writeMobileMode('month', { setItem });
    expect(setItem).toHaveBeenCalledWith('taskman.calendar.mobileMode', 'month');
    expect(() => writeMobileMode('week', { setItem: () => { throw new Error('quota'); } })).not.toThrow();
    expect(readMobileMode({ getItem: () => { throw new Error('denied'); } })).toBe('week');
  });
});
