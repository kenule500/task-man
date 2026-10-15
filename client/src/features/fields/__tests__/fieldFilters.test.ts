import { canAddCustomFilter, filterOptions, filterableFields, withCustomFilter } from '../lib/fieldFilters';
import type { CustomField } from '../types';

const make = (over: Partial<CustomField> & Pick<CustomField, 'key' | 'type'>): CustomField => ({
  _id: over.key, name: over.key, options: [], projects: [], required: false, order: 1, archived: false, ...over,
});

const size = make({
  key: 'size', type: 'select', name: 'Size',
  options: [{ id: 'sm01', label: 'Small', color: 'emerald' }, { id: 'lg01', label: 'Large', color: 'rose' }],
});
const blocked = make({ key: 'blocked', type: 'checkbox', name: 'Blocked' });
const owner = make({ key: 'owner', type: 'user', name: 'Owner' });
const memo = make({ key: 'memo', type: 'text', name: 'Memo' });
const web = make({ key: 'web_only', type: 'select', name: 'Web only', projects: ['Web'], options: [{ id: 'aaaa', label: 'A', color: 'blue' }] });
const gone = make({ key: 'gone', type: 'select', name: 'Gone', archived: true });

describe('filterableFields', () => {
  it('keeps select, multiselect, checkbox and person fields that are not archived', () => {
    const tags = make({ key: 'tags', type: 'multiselect', name: 'Tags' });
    expect(filterableFields([size, tags, blocked, owner, memo, gone]).map(field => field.key)).toEqual(['size', 'tags', 'blocked', 'owner']);
  });

  it('with a project in scope keeps the fields that apply to it', () => {
    expect(filterableFields([size, web], 'Mobile').map(field => field.key)).toEqual(['size']);
    expect(filterableFields([size, web], 'Web').map(field => field.key)).toEqual(['size', 'web_only']);
    expect(filterableFields([size, web], 'all').map(field => field.key)).toEqual(['size', 'web_only']);
  });
});

describe('filterOptions', () => {
  it('offers any, none and the options of a select', () => {
    expect(filterOptions(size, []).map(option => [option.value, option.label])).toEqual([
      ['all', 'Any size'], ['none', 'No size'], ['sm01', 'Small'], ['lg01', 'Large'],
    ]);
  });

  it('offers yes, no and not set for a checkbox', () => {
    expect(filterOptions(blocked, []).map(option => option.value)).toEqual(['all', 'true', 'false', 'none']);
  });

  it('lists the members for a person field', () => {
    expect(filterOptions(owner, [{ _id: 'u1', name: 'Ada' }]).map(option => option.label)).toEqual(['Any owner', 'No owner', 'Ada']);
  });

  it('keeps a chosen value the field no longer has selectable', () => {
    expect(filterOptions(size, [], 'zzzz').at(-1)).toEqual({ value: 'zzzz', label: 'Unknown option' });
    expect(filterOptions(size, [], 'sm01').some(option => option.label === 'Unknown option')).toBe(false);
  });
});

describe('editing the custom filter map', () => {
  it('sets and clears a field', () => {
    expect(withCustomFilter(undefined, 'size', 'sm01')).toEqual({ size: 'sm01' });
    expect(withCustomFilter({ size: 'sm01', blocked: 'true' }, 'size', 'all')).toEqual({ blocked: 'true' });
    expect(withCustomFilter({ size: 'sm01' }, 'size', 'none')).toEqual({ size: 'none' });
  });

  it('stops adding fields at five but still lets a chosen one change', () => {
    const five = { a: '1', b: '1', c: '1', d: '1', e: '1' };
    expect(canAddCustomFilter(five, 'f')).toBe(false);
    expect(canAddCustomFilter(five, 'a')).toBe(true);
    expect(canAddCustomFilter({ a: '1' }, 'f')).toBe(true);
  });
});
