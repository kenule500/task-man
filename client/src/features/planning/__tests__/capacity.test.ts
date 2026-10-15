import { DEFAULT_CAPACITY, MAX_CAPACITY, loadCapacity, parseCapacity, saveCapacity } from '../lib/capacity';

beforeEach(() => window.localStorage.clear());

describe('parseCapacity', () => {
  it('accepts whole numbers within the limits, as numbers or text', () => {
    expect(parseCapacity(8)).toBe(8);
    expect(parseCapacity('13')).toBe(13);
    expect(parseCapacity(String(MAX_CAPACITY))).toBe(MAX_CAPACITY);
  });

  it.each([0, -3, 2.5, MAX_CAPACITY + 1, '', '  ', 'abc', null, undefined, Number.NaN])('rejects %p', value => {
    expect(parseCapacity(value)).toBeNull();
  });
});

describe('loadCapacity and saveCapacity', () => {
  it('defaults to 10 points', () => {
    expect(DEFAULT_CAPACITY).toBe(10);
    expect(loadCapacity('demo')).toBe(10);
  });

  it('keeps the value per workspace', () => {
    saveCapacity('demo', 21);
    saveCapacity('other', 5);
    expect(loadCapacity('demo')).toBe(21);
    expect(loadCapacity('other')).toBe(5);
    expect(loadCapacity('third')).toBe(10);
  });

  it('falls back to the default for a corrupted value', () => {
    window.localStorage.setItem('taskman.workload.capacity.demo', 'lots');
    expect(loadCapacity('demo')).toBe(10);
  });

  it('survives storage that throws', () => {
    const spy = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    const set = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(loadCapacity('demo')).toBe(10);
    expect(() => saveCapacity('demo', 4)).not.toThrow();
    spy.mockRestore();
    set.mockRestore();
  });
});
