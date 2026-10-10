import { MAX_CUSTOM_FILTERS, applyFilters, filtersKey, isFilterParam, matchesCustom, matchesFilters, parseFilterParams, serializeFilters, withFilterParams } from '../lib/filters';
import { makeTask } from './fixtures';

const base = { search: '', status: 'all' as const };

describe('release and custom field filters in the URL', () => {
  it('reads release and cf.<key> parameters', () => {
    const filters = parseFilterParams(new URLSearchParams('release=rel1&cf.size=sm01&cf.blocked=true&cf.owner=none'));
    expect(filters.release).toBe('rel1');
    expect(filters.custom).toEqual({ blocked: 'true', owner: 'none', size: 'sm01' });
  });

  it('defaults to no release and no custom filters', () => {
    const filters = parseFilterParams(new URLSearchParams(''));
    expect(filters.release).toBe('all');
    expect(filters.custom).toEqual({});
    expect(serializeFilters(filters).toString()).toBe('');
  });

  it('ignores invalid keys, empty and oversized values', () => {
    const filters = parseFilterParams(new URLSearchParams(`cf.Size=1&cf.a-b=1&cf.size[$ne]=1&cf.empty=&cf.long=${'x'.repeat(81)}&cf.ok=1&release=a%20b`));
    expect(filters.custom).toEqual({ ok: '1' });
    expect(filters.release).toBe('all');
  });

  it(`keeps at most ${MAX_CUSTOM_FILTERS} custom filters`, () => {
    const params = new URLSearchParams('cf.a=1&cf.b=1&cf.c=1&cf.d=1&cf.e=1&cf.f=1');
    expect(Object.keys(parseFilterParams(params).custom ?? {})).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('serializes sorted and round-trips', () => {
    const text = serializeFilters({ ...parseFilterParams(new URLSearchParams()), release: 'none', custom: { size: 'sm01', blocked: 'true' } }).toString();
    expect(text).toBe('release=none&cf.blocked=true&cf.size=sm01');
    expect(filtersKey(parseFilterParams(new URLSearchParams(text)))).toBe(text);
  });

  it('withFilterParams replaces cf params and keeps navigation params', () => {
    const current = new URLSearchParams('view=list&task=t1&cf.old=1&release=r1&status=pending');
    const next = withFilterParams(current, { ...parseFilterParams(new URLSearchParams()), custom: { size: 'sm01' } });
    expect(next.get('view')).toBe('list');
    expect(next.get('task')).toBe('t1');
    expect(next.has('cf.old')).toBe(false);
    expect(next.has('release')).toBe(false);
    expect(next.has('status')).toBe(false);
    expect(next.get('cf.size')).toBe('sm01');
  });

  it('isFilterParam knows the filter-owned parameters', () => {
    expect(isFilterParam('release')).toBe(true);
    expect(isFilterParam('cf.size')).toBe(true);
    expect(isFilterParam('cf.Size')).toBe(false);
    expect(isFilterParam('task')).toBe(false);
    expect(isFilterParam('qf')).toBe(false);
  });
});

describe('release filter', () => {
  const inRelease = makeTask({ release: 'r1' });
  const other = makeTask({ release: 'r2' });
  const none = makeTask();

  it('matches one release, no release, or any', () => {
    expect(matchesFilters(inRelease, { ...base, release: 'r1' })).toBe(true);
    expect(matchesFilters(other, { ...base, release: 'r1' })).toBe(false);
    expect(matchesFilters(none, { ...base, release: 'r1' })).toBe(false);
    expect(matchesFilters(none, { ...base, release: 'none' })).toBe(true);
    expect(matchesFilters(inRelease, { ...base, release: 'none' })).toBe(false);
    expect(matchesFilters(none, { ...base, release: 'all' })).toBe(true);
  });
});

describe('custom field filters', () => {
  const small = makeTask({ custom: { size: 'sm01', tags: ['aaaa', 'bbbb'], blocked: true, points: 5 } });
  const large = makeTask({ custom: { size: 'lg01', blocked: false } });
  const bare = makeTask();

  it('matches a select value, a multi-select member, checkboxes and numbers as text', () => {
    expect(matchesCustom(small, { size: 'sm01' })).toBe(true);
    expect(matchesCustom(large, { size: 'sm01' })).toBe(false);
    expect(matchesCustom(small, { tags: 'bbbb' })).toBe(true);
    expect(matchesCustom(small, { tags: 'cccc' })).toBe(false);
    expect(matchesCustom(small, { blocked: 'true' })).toBe(true);
    expect(matchesCustom(large, { blocked: 'false' })).toBe(true);
    expect(matchesCustom(large, { blocked: 'true' })).toBe(false);
    expect(matchesCustom(small, { points: '5' })).toBe(true);
  });

  it('none matches tasks without a value (an explicit false is a value)', () => {
    expect(matchesCustom(bare, { size: 'none' })).toBe(true);
    expect(matchesCustom(small, { size: 'none' })).toBe(false);
    expect(matchesCustom(large, { tags: 'none' })).toBe(true);
    expect(matchesCustom(large, { blocked: 'none' })).toBe(false);
    expect(matchesCustom(bare, { blocked: 'none' })).toBe(true);
  });

  it('a task without values never matches a concrete value, and every pair must match', () => {
    expect(matchesCustom(bare, { size: 'sm01' })).toBe(false);
    expect(matchesCustom(small, { size: 'sm01', blocked: 'false' })).toBe(false);
    expect(matchesCustom(small, { size: 'sm01', blocked: 'true' })).toBe(true);
  });

  it('applies inside applyFilters for every view', () => {
    const filters = { ...parseFilterParams(new URLSearchParams('cf.size=sm01')), status: 'all' as const };
    expect(applyFilters([small, large, bare], filters).map(task => task._id)).toEqual([small._id]);
  });
});
