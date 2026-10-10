import { DEFAULT_RECURRENCE, canRepeat, clampEvery, describeRecurrence, shortRecurrence } from '../lib/recurrence';

describe('recurrence helpers', () => {
  it('describes a rule in words', () => {
    expect(describeRecurrence(null)).toBe('Does not repeat');
    expect(describeRecurrence(undefined)).toBe('Does not repeat');
    expect(describeRecurrence({ every: 1, unit: 'day', basis: 'due' })).toBe('Every day, from due date');
    expect(describeRecurrence({ every: 2, unit: 'week', basis: 'completion' })).toBe('Every 2 weeks, from completion');
    expect(describeRecurrence(DEFAULT_RECURRENCE)).toBe('Every week, from due date');
    expect(shortRecurrence({ every: 3, unit: 'month', basis: 'due' })).toBe('every 3 months');
  });

  it('clamps the interval to a whole number from 1 to 365', () => {
    expect(clampEvery('7')).toBe(7);
    expect(clampEvery('2.9')).toBe(2);
    expect(clampEvery('0')).toBe(1);
    expect(clampEvery('-4')).toBe(1);
    expect(clampEvery('')).toBe(1);
    expect(clampEvery('abc')).toBe(1);
    expect(clampEvery(9999)).toBe(365);
  });

  it('lets only top-level work items repeat', () => {
    expect(canRepeat({})).toBe(true);
    expect(canRepeat({ type: 'bug' })).toBe(true);
    expect(canRepeat({ parent: 'p1' })).toBe(false);
    expect(canRepeat({ type: 'epic' })).toBe(false);
  });
});
