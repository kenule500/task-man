import {
  addDays, dateKeyOf, diffInDays, formatDate, isOverdue, parseDateKey, toDateKey,
} from '../lib/date';

describe('date helpers', () => {
  beforeAll(() => {
    jest.useFakeTimers({ now: new Date(2026, 9, 2, 15, 30) });
  });
  afterAll(() => {
    jest.useRealTimers();
  });

  it('round-trips date keys without timezone drift', () => {
    expect(toDateKey(parseDateKey('2026-03-29'))).toBe('2026-03-29');
    expect(parseDateKey('2026-10-02T00:00:00.000Z').getDate()).toBe(2);
  });

  it('extracts the day key from ISO strings', () => {
    expect(dateKeyOf('2026-10-05T00:00:00.000Z')).toBe('2026-10-05');
  });

  it('adds days across month boundaries', () => {
    expect(toDateKey(addDays(parseDateKey('2026-10-30'), 3))).toBe('2026-11-02');
  });

  it('counts whole days, ignoring time of day', () => {
    expect(diffInDays(new Date(2026, 9, 1, 23, 0), new Date(2026, 9, 3, 1, 0))).toBe(2);
    expect(diffInDays(parseDateKey('2026-10-05'), parseDateKey('2026-10-01'))).toBe(-4);
  });

  it('formats dates in the app style', () => {
    expect(formatDate('2026-10-01')).toBe('Oct 1, 2026');
  });

  it('flags only unfinished tasks due before today as overdue', () => {
    expect(isOverdue('2026-10-01', false)).toBe(true);
    expect(isOverdue('2026-10-01', true)).toBe(false);
    expect(isOverdue('2026-10-02', false)).toBe(false);
  });
});
