import { NO_WIP_LIMITS, isOverWip, normalizeWipLimits, parseWipInput, wipCountLabel, wipLimitsEqual } from '../lib/wip';

describe('isOverWip', () => {
  it('only warns when a limit is set and exceeded', () => {
    expect(isOverWip(5, 4)).toBe(true);
    expect(isOverWip(4, 4)).toBe(false);
    expect(isOverWip(9, null)).toBe(false);
    expect(isOverWip(9, undefined)).toBe(false);
  });
});

describe('wipCountLabel', () => {
  it('shows "count / limit" next to a limit and the plain count otherwise', () => {
    expect(wipCountLabel(5, 4)).toBe('5 / 4');
    expect(wipCountLabel(2, 4)).toBe('2 / 4');
    expect(wipCountLabel(5, null)).toBe('5');
  });
});

describe('normalizeWipLimits', () => {
  it('reads the server shape and nulls anything invalid', () => {
    expect(normalizeWipLimits({ wipLimits: { pending: null, 'in-progress': 3, completed: 0 } }))
      .toEqual({ pending: null, 'in-progress': 3, completed: null });
    expect(normalizeWipLimits({ pending: 2.5, 'in-progress': '4', completed: 1000 })).toEqual(NO_WIP_LIMITS);
  });

  it('survives missing or malformed bodies', () => {
    expect(normalizeWipLimits(undefined)).toEqual(NO_WIP_LIMITS);
    expect(normalizeWipLimits('nope')).toEqual(NO_WIP_LIMITS);
    expect(normalizeWipLimits({ wipLimits: null })).toEqual(NO_WIP_LIMITS);
  });
});

describe('parseWipInput', () => {
  it('empty = no limit, whole numbers 1-999 are limits, anything else is invalid', () => {
    expect(parseWipInput('')).toBeNull();
    expect(parseWipInput('  ')).toBeNull();
    expect(parseWipInput(' 4 ')).toBe(4);
    expect(parseWipInput('999')).toBe(999);
    expect(parseWipInput('0')).toBeUndefined();
    expect(parseWipInput('1000')).toBeUndefined();
    expect(parseWipInput('-2')).toBeUndefined();
    expect(parseWipInput('2.5')).toBeUndefined();
    expect(parseWipInput('abc')).toBeUndefined();
  });
});

describe('wipLimitsEqual', () => {
  it('compares every column', () => {
    expect(wipLimitsEqual(NO_WIP_LIMITS, { ...NO_WIP_LIMITS })).toBe(true);
    expect(wipLimitsEqual(NO_WIP_LIMITS, { ...NO_WIP_LIMITS, pending: 1 })).toBe(false);
  });
});
