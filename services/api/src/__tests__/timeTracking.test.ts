import {
  csvCell,
  dayKey,
  formatMinutes,
  MAX_TIMER_MINUTES,
  minutesBetween,
  parseRangeBound,
  summarizeEntries,
  timerEnd,
  toCsvRows,
} from '../utils/timeTracking.js';

const at = (iso: string) => new Date(iso);

describe('minutesBetween', () => {
  it('rounds to whole minutes', () => {
    expect(minutesBetween(at('2030-01-01T10:00:00Z'), at('2030-01-01T10:45:20Z'))).toBe(45);
    expect(minutesBetween(at('2030-01-01T10:00:00Z'), at('2030-01-01T10:45:40Z'))).toBe(46);
  });

  it('counts at least one minute', () => {
    expect(minutesBetween(at('2030-01-01T10:00:00Z'), at('2030-01-01T10:00:05Z'))).toBe(1);
    expect(minutesBetween(at('2030-01-01T10:00:00Z'), at('2030-01-01T09:00:00Z'))).toBe(1);
  });

  it('caps a forgotten timer at a day', () => {
    expect(minutesBetween(at('2030-01-01T10:00:00Z'), at('2030-01-05T10:00:00Z'))).toBe(MAX_TIMER_MINUTES);
  });
});

describe('timerEnd', () => {
  it('ends now for a short timer and a day after the start for a forgotten one', () => {
    const start = at('2030-01-01T10:00:00Z');
    expect(timerEnd(start, at('2030-01-01T11:00:00Z')).toISOString()).toBe('2030-01-01T11:00:00.000Z');
    expect(timerEnd(start, at('2030-01-09T11:00:00Z')).toISOString()).toBe('2030-01-02T10:00:00.000Z');
  });
});

describe('parseRangeBound', () => {
  it('reads a day as a UTC day, with the end of the day for "to"', () => {
    expect(parseRangeBound('2030-03-04', 'from')?.toISOString()).toBe('2030-03-04T00:00:00.000Z');
    expect(parseRangeBound('2030-03-04', 'to')?.toISOString()).toBe('2030-03-04T23:59:59.999Z');
  });

  it('keeps a full date-time as it is', () => {
    expect(parseRangeBound('2030-03-04T05:00:00.000Z', 'to')?.toISOString()).toBe('2030-03-04T05:00:00.000Z');
  });

  it('rejects anything else', () => {
    expect(parseRangeBound('soon', 'from')).toBeNull();
    expect(parseRangeBound(undefined, 'from')).toBeNull();
    expect(parseRangeBound(['2030-03-04'], 'from')).toBeNull();
    expect(parseRangeBound({ $gt: '' }, 'to')).toBeNull();
  });
});

describe('summarizeEntries', () => {
  const rows = [
    { userId: 'u1', taskId: 't1', startedAt: at('2030-01-02T09:00:00Z'), minutes: 30 },
    { userId: 'u1', taskId: 't2', startedAt: at('2030-01-01T23:30:00Z'), minutes: 60 },
    { userId: 'u2', taskId: 't1', startedAt: at('2030-01-02T14:00:00Z'), minutes: 90 },
  ];

  it('totals overall and per user, day and task', () => {
    const totals = summarizeEntries(rows);
    expect(totals.minutes).toBe(180);
    expect(totals.byUser).toEqual([{ user: 'u1', minutes: 90 }, { user: 'u2', minutes: 90 }]);
    expect(totals.byDay).toEqual([{ day: '2030-01-01', minutes: 60 }, { day: '2030-01-02', minutes: 120 }]);
    expect(totals.byTask).toEqual([{ task: 't1', minutes: 120 }, { task: 't2', minutes: 60 }]);
  });

  it('is empty without entries', () => {
    expect(summarizeEntries([])).toEqual({ minutes: 0, byUser: [], byDay: [], byTask: [] });
  });
});

describe('formatting', () => {
  it('formats minutes as hours and minutes', () => {
    expect(formatMinutes(0)).toBe('0m');
    expect(formatMinutes(45)).toBe('45m');
    expect(formatMinutes(180)).toBe('3h');
    expect(formatMinutes(150)).toBe('2h 30m');
  });

  it('gives the UTC day', () => {
    expect(dayKey(at('2030-01-01T23:59:59Z'))).toBe('2030-01-01');
  });
});

describe('csv', () => {
  it('neutralises formulas and doubles quotes', () => {
    expect(csvCell('=SUM(A1)')).toBe('"\'=SUM(A1)"');
    expect(csvCell('+1')).toBe('"\'+1"');
    expect(csvCell('-2')).toBe('"\'-2"');
    expect(csvCell('@cmd')).toBe('"\'@cmd"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell(null)).toBe('""');
    expect(csvCell(42)).toBe('"42"');
  });

  it('joins rows with CRLF', () => {
    expect(toCsvRows([['a', 'b'], ['c', '=d']])).toBe('"a","b"\r\n"c","\'=d"\r\n');
    expect(toCsvRows([])).toBe('');
  });
});
