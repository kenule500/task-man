import { MAX_SAVED_VIEW_QUERY, normalizeViewQuery } from '../utils/savedViewQuery.js';

describe('normalizeViewQuery', () => {
  it('accepts filter and board keys and drops a leading "?"', () => {
    expect(normalizeViewQuery('?status=pending&assignedToMe=1')).toBe('status=pending&assignedToMe=1');
    expect(normalizeViewQuery('q=release+notes&qf=mine,bugs&group=assignee')).toBe('q=release+notes&qf=mine%2Cbugs&group=assignee');
  });

  it('accepts an empty query (a view without filters)', () => {
    expect(normalizeViewQuery('')).toBe('');
    expect(normalizeViewQuery('?')).toBe('');
  });

  it('rejects navigation state and unknown keys', () => {
    expect(normalizeViewQuery('task=abc')).toBeNull();
    expect(normalizeViewQuery('new=1')).toBeNull();
    expect(normalizeViewQuery('col=pending')).toBeNull();
    expect(normalizeViewQuery('status=pending&evil=1')).toBeNull();
  });

  it('rejects repeated keys, long values, long queries and non-strings', () => {
    expect(normalizeViewQuery('status=pending&status=completed')).toBeNull();
    expect(normalizeViewQuery(`q=${'a'.repeat(201)}`)).toBeNull();
    expect(normalizeViewQuery(`q=${'a'.repeat(MAX_SAVED_VIEW_QUERY)}`)).toBeNull();
    expect(normalizeViewQuery(undefined)).toBeNull();
    expect(normalizeViewQuery(5)).toBeNull();
  });
});
