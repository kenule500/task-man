import { readListColumns, writeListColumns } from '../preferences';

describe('list column preferences', () => {
  beforeEach(() => localStorage.clear());

  it('returns null until something was saved', () => {
    expect(readListColumns('acme')).toBeNull();
  });

  it('saves the columns per workspace', () => {
    writeListColumns('acme', ['assignees', 'cf:size']);
    writeListColumns('globex', ['status']);
    expect(readListColumns('acme')).toEqual(['assignees', 'cf:size']);
    expect(readListColumns('globex')).toEqual(['status']);
  });

  it('keeps an empty choice (every optional column hidden) apart from "never chosen"', () => {
    writeListColumns('acme', []);
    expect(readListColumns('acme')).toEqual([]);
  });

  it('forgets the choice when saving null', () => {
    writeListColumns('acme', ['status']);
    writeListColumns('acme', null);
    expect(readListColumns('acme')).toBeNull();
  });

  it('ignores malformed or tampered values', () => {
    localStorage.setItem('taskman.listColumns.acme', '{not json');
    expect(readListColumns('acme')).toBeNull();
    localStorage.setItem('taskman.listColumns.acme', JSON.stringify({ a: 1 }));
    expect(readListColumns('acme')).toBeNull();
    localStorage.setItem('taskman.listColumns.acme', JSON.stringify(['ok', 5]));
    expect(readListColumns('acme')).toBeNull();
    localStorage.setItem('taskman.listColumns.acme', JSON.stringify(['x'.repeat(61)]));
    expect(readListColumns('acme')).toBeNull();
  });

  it('survives a storage that throws', () => {
    const spy = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    expect(() => writeListColumns('acme', ['status'])).not.toThrow();
    spy.mockRestore();
  });
});
