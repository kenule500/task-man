import {
  appliesToProject, createCustom, diffCustom, draftOf, fieldsForProject, isEmptyValue, mergeCustom, missingRequired, moveItem,
  optionsPayload, parseNumberInput, safeHref, validateFieldDraft, valueText,
} from '../lib/fields';
import type { CustomField } from '../types';
import { taskCsvRows } from '@/features/tasks/lib/csv';
import { makeTask } from '@/features/tasks/__tests__/fixtures';

const make = (over: Partial<CustomField> & Pick<CustomField, 'key' | 'type'>): CustomField => ({
  _id: over.key, name: over.key, options: [], projects: [], required: false, order: 1, archived: false, ...over,
});

const size = make({
  key: 'size', type: 'select', name: 'Size',
  options: [{ id: 'sm01', label: 'Small', color: 'emerald' }, { id: 'lg01', label: 'Large', color: 'rose' }],
});
const tags = make({
  key: 'tags', type: 'multiselect', name: 'Tags',
  options: [{ id: 'aaaa', label: 'Front', color: 'blue' }, { id: 'bbbb', label: 'Back', color: 'violet' }],
});
const goal = make({ key: 'goal', type: 'text', name: 'Goal', required: true, projects: ['Web'] });

describe('which fields apply', () => {
  it('a field without projects applies everywhere', () => {
    expect(appliesToProject(size, 'Web')).toBe(true);
    expect(appliesToProject(size, undefined)).toBe(true);
    expect(appliesToProject(goal, 'Web')).toBe(true);
    expect(appliesToProject(goal, 'Mobile')).toBe(false);
    expect(appliesToProject(goal, '')).toBe(false);
  });

  it('fieldsForProject drops archived and inapplicable fields', () => {
    const archived = { ...size, key: 'old', archived: true };
    expect(fieldsForProject([size, goal, archived], 'Mobile').map(field => field.key)).toEqual(['size']);
    expect(fieldsForProject([size, goal, archived], 'Web').map(field => field.key)).toEqual(['size', 'goal']);
  });
});

describe('values', () => {
  it('isEmptyValue treats blank text and empty lists as empty but not false or 0', () => {
    expect(isEmptyValue(undefined)).toBe(true);
    expect(isEmptyValue(null)).toBe(true);
    expect(isEmptyValue('')).toBe(true);
    expect(isEmptyValue([])).toBe(true);
    expect(isEmptyValue(false)).toBe(false);
    expect(isEmptyValue(0)).toBe(false);
  });

  it('valueText names options, people and booleans', () => {
    expect(valueText(size, 'lg01')).toBe('Large');
    expect(valueText(size, 'gone')).toBe('gone');
    expect(valueText(tags, ['aaaa', 'bbbb'])).toBe('Front; Back');
    expect(valueText(make({ key: 'ok', type: 'checkbox' }), true)).toBe('Yes');
    expect(valueText(make({ key: 'ok', type: 'checkbox' }), false)).toBe('No');
    expect(valueText(make({ key: 'who', type: 'user' }), 'u1', { userName: id => (id === 'u1' ? 'Ada' : undefined) })).toBe('Ada');
    expect(valueText(make({ key: 'who', type: 'user' }), 'u2')).toBe('Member');
    expect(valueText(size, undefined)).toBe('');
  });

  it('diffCustom sends only changed keys and null for cleared ones', () => {
    expect(diffCustom({ size: 'sm01', note: 'a' }, { size: 'sm01', note: 'a' })).toBeUndefined();
    expect(diffCustom({ size: 'sm01', note: 'a' }, { size: 'lg01', note: 'a' })).toEqual({ size: 'lg01' });
    expect(diffCustom({ size: 'sm01', note: 'a' }, { size: 'sm01' })).toEqual({ note: null });
    expect(diffCustom(undefined, { tags: ['aaaa'] })).toEqual({ tags: ['aaaa'] });
    expect(diffCustom({ tags: ['aaaa'] }, { tags: [] })).toEqual({ tags: null });
    expect(diffCustom({ done: false }, { done: true })).toEqual({ done: true });
  });

  it('createCustom keeps filled values of known fields only', () => {
    expect(createCustom([size, tags], { size: 'sm01', tags: [], ghost: 'x' })).toEqual({ size: 'sm01' });
    expect(createCustom([size], {})).toBeUndefined();
  });

  it('mergeCustom applies a patch like the server', () => {
    expect(mergeCustom({ a: 'x', b: 'y' }, { a: null, c: 'z' })).toEqual({ b: 'y', c: 'z' });
    expect(mergeCustom(undefined, { a: 1 })).toEqual({ a: 1 });
  });

  it('missingRequired only lists applicable required fields without a value', () => {
    expect(missingRequired([goal, size], 'Web', {}).map(field => field.key)).toEqual(['goal']);
    expect(missingRequired([goal, size], 'Mobile', {})).toEqual([]);
    expect(missingRequired([goal], 'Web', { goal: 'Ship' })).toEqual([]);
    expect(missingRequired([make({ key: 'ok', type: 'checkbox', required: true })], '', {})).toEqual([]);
  });
});

describe('field drafts', () => {
  it('validates the name and the options like the API', () => {
    const base = draftOf(null);
    expect(validateFieldDraft({ ...base, name: '  ' }).name).toBeTruthy();
    expect(validateFieldDraft({ ...base, name: 'x'.repeat(41) }).name).toBeTruthy();
    expect(validateFieldDraft({ ...base, name: 'Ok' })).toEqual({});
    const select = { ...base, name: 'Ok', type: 'select' as const };
    expect(validateFieldDraft(select).options).toMatch(/at least one/);
    expect(validateFieldDraft({ ...select, options: [{ label: ' ', color: 'slate' }] }).options).toMatch(/needs a name/);
    expect(validateFieldDraft({ ...select, options: [{ label: 'A', color: 'slate' }, { label: 'a', color: 'blue' }] }).options).toMatch(/different/);
    expect(validateFieldDraft({ ...select, options: [{ label: 'A', color: 'slate' }] })).toEqual({});
  });

  it('optionsPayload trims labels and keeps ids of saved options only', () => {
    expect(optionsPayload([{ id: 'sm01', label: ' Small ', color: 'emerald' }, { label: 'New', color: 'blue' }]))
      .toEqual([{ id: 'sm01', label: 'Small', color: 'emerald' }, { label: 'New', color: 'blue' }]);
  });

  it('draftOf copies a saved field', () => {
    const draft = draftOf(size);
    expect(draft).toMatchObject({ name: 'Size', type: 'select', required: false, projects: [] });
    draft.options[0].label = 'Changed';
    expect(size.options[0].label).toBe('Small');
  });
});

describe('small helpers', () => {
  it('moveItem swaps neighbours and ignores out-of-range moves', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c']);
    expect(moveItem(['a', 'b', 'c'], 2, 1)).toEqual(['a', 'c', 'b']);
    expect(moveItem(['a', 'b'], 0, -1)).toEqual(['a', 'b']);
    expect(moveItem(['a', 'b'], 1, 2)).toEqual(['a', 'b']);
  });

  it('safeHref only returns http and https links', () => {
    expect(safeHref('https://example.com/a')).toBe('https://example.com/a');
    expect(safeHref('javascript:alert(1)')).toBeNull();
    expect(safeHref('data:text/html,hi')).toBeNull();
    expect(safeHref('not a url')).toBeNull();
  });

  it('parseNumberInput accepts finite numbers only', () => {
    expect(parseNumberInput(' 12.5 ')).toBe(12.5);
    expect(parseNumberInput('')).toBeNull();
    expect(parseNumberInput('abc')).toBeNull();
    expect(parseNumberInput('Infinity')).toBeNull();
  });
});

describe('CSV export', () => {
  it('adds a column per active custom field', () => {
    const archived = { ...tags, archived: true };
    const task = makeTask({ title: 'Plan', custom: { size: 'lg01', goal: 'Ship', tags: ['aaaa'] } });
    const [header, row] = taskCsvRows([task], [task], { customFields: [size, goal, archived] });
    expect(header.slice(-2)).toEqual(['Size', 'Goal']);
    expect(row.slice(-2)).toEqual(['Large', 'Ship']);
    expect(header).not.toContain('Tags');
  });

  it('keeps the old columns without custom fields', () => {
    const [header] = taskCsvRows([makeTask({ title: 'Plan' })]);
    expect(header[header.length - 1]).toBe('Parent key');
  });
});
