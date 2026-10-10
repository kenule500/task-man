import {
  coerceFieldValue,
  describeCustomChanges,
  fieldAppliesTo,
  fieldPath,
  planCustomValues,
  plainCustom,
  slugFromName,
  type FieldDef,
} from '../utils/customFields.js';
import { buildTaskFilter, parseTaskListQuery } from '../utils/taskQuery.js';

const USER = 'a'.repeat(24);
const ctx = { memberIds: new Set([USER]) };

const def = (over: Partial<FieldDef> & Pick<FieldDef, 'key' | 'type'>): FieldDef => ({
  name: over.key,
  options: [],
  projects: [],
  required: false,
  archived: false,
  ...over,
});

const size = def({ key: 'size', type: 'select', options: [{ id: 'sm01', label: 'Small' }, { id: 'lg01', label: 'Large' }] });
const tags = def({ key: 'tags', type: 'multiselect', options: [{ id: 'aaaa', label: 'A' }, { id: 'bbbb', label: 'B' }] });

describe('coerceFieldValue', () => {
  it('null clears every type', () => {
    for (const type of ['text', 'number', 'date', 'select', 'multiselect', 'checkbox', 'url', 'user'] as const) {
      expect(coerceFieldValue(def({ key: 'x', type }), null, ctx)).toEqual({ ok: true, value: null });
    }
  });

  it('trims text, caps it at 500 and treats blank as cleared', () => {
    const text = def({ key: 'note', type: 'text' });
    expect(coerceFieldValue(text, '  hi  ', ctx)).toEqual({ ok: true, value: 'hi' });
    expect(coerceFieldValue(text, '   ', ctx)).toEqual({ ok: true, value: null });
    expect(coerceFieldValue(text, 'x'.repeat(500), ctx).ok).toBe(true);
    expect(coerceFieldValue(text, 'x'.repeat(501), ctx).ok).toBe(false);
    expect(coerceFieldValue(text, 5, ctx).ok).toBe(false);
  });

  it('accepts finite numbers and numeric text only', () => {
    const num = def({ key: 'n', type: 'number' });
    expect(coerceFieldValue(num, 4.5, ctx)).toEqual({ ok: true, value: 4.5 });
    expect(coerceFieldValue(num, '12', ctx)).toEqual({ ok: true, value: 12 });
    expect(coerceFieldValue(num, Infinity, ctx).ok).toBe(false);
    expect(coerceFieldValue(num, NaN, ctx).ok).toBe(false);
    expect(coerceFieldValue(num, 'abc', ctx).ok).toBe(false);
    expect(coerceFieldValue(num, '', ctx).ok).toBe(false);
    expect(coerceFieldValue(num, true, ctx).ok).toBe(false);
  });

  it('accepts real calendar days (YYYY-MM-DD)', () => {
    const date = def({ key: 'd', type: 'date' });
    expect(coerceFieldValue(date, '2030-02-28', ctx).ok).toBe(true);
    expect(coerceFieldValue(date, '2030-02-30', ctx).ok).toBe(false);
    expect(coerceFieldValue(date, '2030-2-3', ctx).ok).toBe(false);
    expect(coerceFieldValue(date, '2030-01-01T00:00:00Z', ctx).ok).toBe(false);
  });

  it('select needs one of its option ids', () => {
    expect(coerceFieldValue(size, 'sm01', ctx)).toEqual({ ok: true, value: 'sm01' });
    expect(coerceFieldValue(size, 'Small', ctx).ok).toBe(false);
    expect(coerceFieldValue(size, ['sm01'], ctx).ok).toBe(false);
  });

  it('multiselect needs a list of known ids, unique, at most 20', () => {
    expect(coerceFieldValue(tags, ['aaaa', 'bbbb', 'aaaa'], ctx)).toEqual({ ok: true, value: ['aaaa', 'bbbb'] });
    expect(coerceFieldValue(tags, [], ctx)).toEqual({ ok: true, value: null });
    expect(coerceFieldValue(tags, ['zzzz'], ctx).ok).toBe(false);
    expect(coerceFieldValue(tags, 'aaaa', ctx).ok).toBe(false);
    expect(coerceFieldValue(tags, Array.from({ length: 21 }, () => 'aaaa'), ctx).ok).toBe(false);
  });

  it('checkbox is a boolean', () => {
    const box = def({ key: 'b', type: 'checkbox' });
    expect(coerceFieldValue(box, false, ctx)).toEqual({ ok: true, value: false });
    expect(coerceFieldValue(box, 'true', ctx).ok).toBe(false);
  });

  it('url is http(s), at most 500 characters', () => {
    const url = def({ key: 'u', type: 'url' });
    expect(coerceFieldValue(url, ' https://example.com/a?b=1 ', ctx)).toEqual({ ok: true, value: 'https://example.com/a?b=1' });
    expect(coerceFieldValue(url, 'javascript:alert(1)', ctx).ok).toBe(false);
    expect(coerceFieldValue(url, 'ftp://example.com', ctx).ok).toBe(false);
    expect(coerceFieldValue(url, 'example.com', ctx).ok).toBe(false);
    expect(coerceFieldValue(url, `https://example.com/${'a'.repeat(500)}`, ctx).ok).toBe(false);
  });

  it('user must be a workspace member id', () => {
    const user = def({ key: 'owner', type: 'user' });
    expect(coerceFieldValue(user, USER, ctx)).toEqual({ ok: true, value: USER });
    expect(coerceFieldValue(user, 'b'.repeat(24), ctx).ok).toBe(false);
    expect(coerceFieldValue(user, { $ne: null }, ctx).ok).toBe(false);
  });
});

describe('planCustomValues', () => {
  const required = def({ key: 'sprintgoal', type: 'text', name: 'Goal', required: true, projects: ['Web'] });

  it('merges: sets values and lists the keys to clear', () => {
    const result = planCustomValues([size, tags], { size: 'lg01', tags: null }, { ...ctx, mode: 'update' });
    expect(result).toEqual({ ok: true, plan: { set: { size: 'lg01' }, clear: ['tags'] } });
  });

  it('rejects unknown keys, odd keys and archived fields (clearing an archived one is fine)', () => {
    expect(planCustomValues([size], { nope: 1 }, { ...ctx, mode: 'update' }).ok).toBe(false);
    expect(planCustomValues([size], { 'size.$x': 1 }, { ...ctx, mode: 'update' }).ok).toBe(false);
    expect(planCustomValues([size], JSON.parse('{"__proto__": 1}'), { ...ctx, mode: 'update' }).ok).toBe(false);
    const archived = { ...size, archived: true };
    expect(planCustomValues([archived], { size: 'sm01' }, { ...ctx, mode: 'update' }).ok).toBe(false);
    expect(planCustomValues([archived], { size: null }, { ...ctx, mode: 'update' }).ok).toBe(true);
  });

  it('rejects a body that is not an object', () => {
    expect(planCustomValues([size], [], { ...ctx, mode: 'update' }).ok).toBe(false);
    expect(planCustomValues([size], 'x', { ...ctx, mode: 'update' }).ok).toBe(false);
    expect(planCustomValues([size], undefined, { ...ctx, mode: 'update' }).ok).toBe(true);
  });

  it('enforces required fields on create for the projects they apply to', () => {
    expect(planCustomValues([required], {}, { ...ctx, mode: 'create', project: 'Web' })).toEqual({ ok: false, error: 'Goal is required' });
    expect(planCustomValues([required], {}, { ...ctx, mode: 'create', project: 'Mobile' }).ok).toBe(true);
    expect(planCustomValues([required], {}, { ...ctx, mode: 'create', project: '' }).ok).toBe(true);
    expect(planCustomValues([required], { sprintgoal: 'Ship' }, { ...ctx, mode: 'create', project: 'Web' }).ok).toBe(true);
    // Blank text counts as missing
    expect(planCustomValues([required], { sprintgoal: ' ' }, { ...ctx, mode: 'create', project: 'Web' }).ok).toBe(false);
  });

  it('does not enforce required fields on update, for archived fields or checkboxes', () => {
    expect(planCustomValues([required], {}, { ...ctx, mode: 'update', project: 'Web' }).ok).toBe(true);
    expect(planCustomValues([{ ...required, archived: true }], {}, { ...ctx, mode: 'create', project: 'Web' }).ok).toBe(true);
    const box = def({ key: 'b', type: 'checkbox', required: true });
    expect(planCustomValues([box], {}, { ...ctx, mode: 'create' }).ok).toBe(true);
  });
});

describe('helpers', () => {
  it('fieldAppliesTo: no projects means every project', () => {
    expect(fieldAppliesTo({ projects: [] }, 'Web')).toBe(true);
    expect(fieldAppliesTo({ projects: ['Web'] }, 'Web')).toBe(true);
    expect(fieldAppliesTo({ projects: ['Web'] }, 'Mobile')).toBe(false);
    expect(fieldAppliesTo({ projects: ['Web'] }, '')).toBe(false);
  });

  it('fieldPath only builds paths for slug keys', () => {
    expect(fieldPath('story_size')).toBe('custom.story_size');
    expect(() => fieldPath('a.b')).toThrow();
    expect(() => fieldPath('$where')).toThrow();
    expect(() => fieldPath('')).toThrow();
  });

  it('slugFromName builds unique valid keys', () => {
    expect(slugFromName('Story size', new Set())).toBe('story_size');
    expect(slugFromName('Story size', new Set(['story_size']))).toBe('story_size_2');
    expect(slugFromName('123 go!', new Set())).toMatch(/^[a-z][a-z0-9_]{0,29}$/);
    expect(slugFromName('عربي', new Set())).toMatch(/^[a-z][a-z0-9_]{0,29}$/);
    expect(slugFromName('x'.repeat(80), new Set()).length).toBeLessThanOrEqual(30);
  });

  it('plainCustom reads maps and objects and drops empty values', () => {
    expect(plainCustom(new Map<string, unknown>([['a', 1], ['b', null]]))).toEqual({ a: 1 });
    expect(plainCustom({ a: 'x', $bad: 1 })).toEqual({ a: 'x' });
    expect(plainCustom(undefined)).toEqual({});
  });

  it('describeCustomChanges names option labels and skips equal values', () => {
    const after = new Map<string, unknown>([['size', 'lg01'], ['tags', ['aaaa']], ['note', 'hi']]);
    const changes = describeCustomChanges({ size: 'sm01', tags: ['aaaa'] }, after, [size, tags]);
    expect(changes).toEqual([
      { field: 'custom.note', from: undefined, to: 'hi' },
      { field: 'custom.size', from: 'Small', to: 'Large' },
    ]);
  });
});

describe('task list filter on custom fields', () => {
  it('parses cf.<key> and builds a safe filter', () => {
    const query = parseTaskListQuery({ 'cf.size': 'sm01', 'cf.budget': '12', 'cf.done': 'true', 'cf.$bad': 'x', 'cf.a.b': 'x', 'cf.note': { $ne: 1 } });
    expect(query.custom).toEqual({ size: 'sm01', budget: '12', done: 'true' });
    const filter = buildTaskFilter('ws', query) as Record<string, unknown>;
    expect(filter['custom.size']).toEqual({ $in: ['sm01'] });
    expect(filter['custom.budget']).toEqual({ $in: ['12', 12] });
    expect(filter['custom.done']).toEqual({ $in: ['true', true] });
    expect(Object.keys(filter).filter(key => key.startsWith('custom.'))).toHaveLength(3);
  });

  it('"none" matches tasks without a value and at most 5 filters are used', () => {
    const query = parseTaskListQuery({ 'cf.a': 'none', 'cf.b': '1', 'cf.c': '1', 'cf.d': '1', 'cf.e': '1', 'cf.f': '1' });
    expect(Object.keys(query.custom ?? {})).toHaveLength(5);
    expect((buildTaskFilter('ws', query) as Record<string, unknown>)['custom.a']).toEqual({ $in: [null] });
  });
});
