import {
  addInterval,
  addMonths,
  describeRecurrence,
  nextOccurrenceDates,
  normalizeRecurrence,
  recurrenceProblem,
} from '../utils/recurrence.js';

const day = (key: string) => new Date(`${key}T00:00:00.000Z`);
const key = (date: Date | undefined) => date?.toISOString().slice(0, 10);

describe('addMonths', () => {
  it('clamps to the end of a shorter month', () => {
    expect(key(addMonths(day('2031-01-31'), 1))).toBe('2031-02-28');
    expect(key(addMonths(day('2032-01-31'), 1))).toBe('2032-02-29');
    expect(key(addMonths(day('2031-03-31'), 1))).toBe('2031-04-30');
  });

  it('keeps the day when the month is long enough and crosses years', () => {
    expect(key(addMonths(day('2031-01-15'), 1))).toBe('2031-02-15');
    expect(key(addMonths(day('2031-11-30'), 3))).toBe('2032-02-29');
    expect(key(addMonths(day('2031-12-31'), 12))).toBe('2032-12-31');
    expect(key(addMonths(day('2031-12-15'), 1))).toBe('2032-01-15');
  });

  it('keeps the time of day', () => {
    expect(addMonths(new Date('2031-01-31T13:45:10.500Z'), 1).toISOString()).toBe('2031-02-28T13:45:10.500Z');
  });
});

describe('addInterval', () => {
  it('adds days and weeks', () => {
    expect(key(addInterval(day('2031-02-27'), 3, 'day'))).toBe('2031-03-02');
    expect(key(addInterval(day('2031-02-27'), 2, 'week'))).toBe('2031-03-13');
  });

  it('adds calendar months', () => {
    expect(key(addInterval(day('2031-01-31'), 1, 'month'))).toBe('2031-02-28');
  });
});

describe('nextOccurrenceDates', () => {
  const weekly = { every: 1, unit: 'week', basis: 'due' } as const;

  it('shifts from the due date for basis due', () => {
    const next = nextOccurrenceDates({ deadline: day('2031-05-10') }, weekly, day('2031-06-01'));
    expect(key(next.deadline)).toBe('2031-05-17');
    expect(next.startDate).toBeUndefined();
  });

  it('shifts from the completion day for basis completion, ignoring the time of day', () => {
    const next = nextOccurrenceDates(
      { deadline: day('2031-05-10') },
      { every: 2, unit: 'day', basis: 'completion' },
      new Date('2031-06-01T22:30:00.000Z'),
    );
    expect(key(next.deadline)).toBe('2031-06-03');
  });

  it('keeps the span between start and due date', () => {
    const next = nextOccurrenceDates(
      { startDate: day('2031-05-06'), deadline: day('2031-05-10') },
      weekly,
      day('2031-05-10'),
    );
    expect(key(next.startDate)).toBe('2031-05-13');
    expect(key(next.deadline)).toBe('2031-05-17');
  });

  it('uses calendar months clamped to the month end, and keeps the span', () => {
    const next = nextOccurrenceDates(
      { startDate: day('2031-01-29'), deadline: day('2031-01-31') },
      { every: 1, unit: 'month', basis: 'due' },
      day('2031-01-31'),
    );
    expect(key(next.deadline)).toBe('2031-02-28');
    expect(key(next.startDate)).toBe('2031-02-26');
  });

  it('handles a leap February', () => {
    const next = nextOccurrenceDates({ deadline: day('2032-01-31') }, { every: 1, unit: 'month', basis: 'due' });
    expect(key(next.deadline)).toBe('2032-02-29');
  });

  it('counts months from the completion day for basis completion', () => {
    const next = nextOccurrenceDates(
      { deadline: day('2031-01-10') },
      { every: 1, unit: 'month', basis: 'completion' },
      day('2031-03-31'),
    );
    expect(key(next.deadline)).toBe('2031-04-30');
  });
});

describe('recurrenceProblem', () => {
  it('accepts null, undefined and a complete rule', () => {
    expect(recurrenceProblem(null)).toBeNull();
    expect(recurrenceProblem(undefined)).toBeNull();
    expect(recurrenceProblem({ every: 1, unit: 'day', basis: 'due' })).toBeNull();
    expect(recurrenceProblem({ every: 365, unit: 'month', basis: 'completion' })).toBeNull();
  });

  it('rejects bad intervals, units, bases and shapes', () => {
    expect(recurrenceProblem({ every: 0, unit: 'day', basis: 'due' })).toMatch(/interval/);
    expect(recurrenceProblem({ every: 366, unit: 'day', basis: 'due' })).toMatch(/interval/);
    expect(recurrenceProblem({ every: 1.5, unit: 'day', basis: 'due' })).toMatch(/interval/);
    expect(recurrenceProblem({ every: '2', unit: 'day', basis: 'due' })).toMatch(/interval/);
    expect(recurrenceProblem({ every: 1, unit: 'year', basis: 'due' })).toMatch(/unit/);
    expect(recurrenceProblem({ every: 1, unit: 'day', basis: 'never' })).toMatch(/basis/);
    expect(recurrenceProblem('daily')).toMatch(/object/);
    expect(recurrenceProblem([])).toMatch(/object/);
  });
});

describe('normalizeRecurrence / describeRecurrence', () => {
  it('keeps only the known keys', () => {
    expect(normalizeRecurrence({ every: 2, unit: 'week', basis: 'due', $where: 'x' })).toEqual({ every: 2, unit: 'week', basis: 'due' });
    expect(normalizeRecurrence(null)).toBeNull();
  });

  it('describes a rule in words', () => {
    expect(describeRecurrence({ every: 1, unit: 'day', basis: 'due' })).toBe('every day from due date');
    expect(describeRecurrence({ every: 3, unit: 'month', basis: 'completion' })).toBe('every 3 months from completion');
    expect(describeRecurrence(null)).toBeUndefined();
  });
});
