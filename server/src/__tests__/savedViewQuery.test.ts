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

  it('accepts the release filter and custom field filters', () => {
    expect(normalizeViewQuery('release=64b0f0f0f0f0f0f0f0f0f0f0&cf.story_size=abc123')).toBe('release=64b0f0f0f0f0f0f0f0f0f0f0&cf.story_size=abc123');
    expect(normalizeViewQuery('release=none&cf.blocked=none')).toBe('release=none&cf.blocked=none');
  });

  it('validates custom field keys strictly', () => {
    expect(normalizeViewQuery('cf.Size=1')).toBeNull();
    expect(normalizeViewQuery('cf.1size=1')).toBeNull();
    expect(normalizeViewQuery('cf.=1')).toBeNull();
    expect(normalizeViewQuery('cf.a-b=1')).toBeNull();
    expect(normalizeViewQuery('cf.a.b=1')).toBeNull();
    expect(normalizeViewQuery('cf.size[$ne]=1')).toBeNull();
    expect(normalizeViewQuery('xcf.size=1')).toBeNull();
    expect(normalizeViewQuery(`cf.${'a'.repeat(31)}=1`)).toBeNull();
    expect(normalizeViewQuery(`cf.${'a'.repeat(30)}=1`)).not.toBeNull();
    expect(normalizeViewQuery('cf.size=1&cf.size=2')).toBeNull();
  });

  it('allows at most five custom field filters and limits their values', () => {
    expect(normalizeViewQuery('cf.a=1&cf.b=1&cf.c=1&cf.d=1&cf.e=1')).not.toBeNull();
    expect(normalizeViewQuery('cf.a=1&cf.b=1&cf.c=1&cf.d=1&cf.e=1&cf.f=1')).toBeNull();
    expect(normalizeViewQuery(`cf.a=${'x'.repeat(201)}`)).toBeNull();
  });
});
