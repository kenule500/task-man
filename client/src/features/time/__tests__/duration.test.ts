import {
  describeDuration, describeProgress, formatDuration, formatElapsed, parseDuration, timeProgress,
} from '../lib/duration';

describe('parseDuration', () => {
  it.each([
    ['2h 30m', 150],
    ['2h30m', 150],
    ['2h30', 150],
    ['2 hours 30 minutes', 150],
    ['1.5h', 90],
    ['1,5h', 90],
    ['90m', 90],
    ['90 min', 90],
    ['3h', 180],
    ['45', 45],
    ['1:30', 90],
    ['0:05', 5],
    ['  1H 5M ', 65],
  ])('reads %s as %i minutes', (text, minutes) => {
    expect(parseDuration(text)).toBe(minutes);
  });

  it.each(['', '   ', 'soon', 'h', '2x', '2h 3h', '1m 2m', '-5', '1.5', 'two hours', '2h 30m extra', '1:75'])(
    'rejects %j',
    text => {
      expect(parseDuration(text)).toBeNull();
    },
  );
});

describe('formatting', () => {
  it('formats minutes as hours and minutes', () => {
    expect(formatDuration(0)).toBe('0m');
    expect(formatDuration(45)).toBe('45m');
    expect(formatDuration(180)).toBe('3h');
    expect(formatDuration(150)).toBe('2h 30m');
    expect(formatDuration(-4)).toBe('0m');
  });

  it('spells durations out for screen readers', () => {
    expect(describeDuration(150)).toBe('2 hours 30 minutes');
    expect(describeDuration(60)).toBe('1 hour');
    expect(describeDuration(1)).toBe('1 minute');
    expect(describeDuration(0)).toBe('0 minutes');
  });

  it('shows the clock face of a timer', () => {
    expect(formatElapsed(0)).toBe('0:00');
    expect(formatElapsed(65_000)).toBe('1:05');
    expect(formatElapsed(3_725_000)).toBe('1:02:05');
    expect(formatElapsed(-5)).toBe('0:00');
  });
});

describe('progress', () => {
  it('compares logged time with the estimate', () => {
    expect(timeProgress(30, 120)).toEqual({ percent: 25, over: false, remaining: 90, overBy: 0 });
    expect(timeProgress(120, 120)).toMatchObject({ percent: 100, over: false });
    expect(timeProgress(195, 150)).toEqual({ percent: 100, over: true, remaining: 0, overBy: 45 });
  });

  it('has no progress without an estimate', () => {
    expect(timeProgress(30, null)).toBeNull();
    expect(timeProgress(30, 0)).toBeNull();
    expect(timeProgress(30, undefined)).toBeNull();
  });

  it('describes the state in words', () => {
    expect(describeProgress(195, 150)).toBe('3h 15m of 2h 30m (45m over)');
    expect(describeProgress(30, 120)).toBe('30m of 2h (1h 30m left)');
    expect(describeProgress(60, null)).toBe('1h logged');
    expect(describeProgress(0, null)).toBe('Nothing logged yet');
  });
});
