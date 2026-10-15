import type { CustomField } from '@/features/fields/types';
import {
  builtInColumns, customColumns, gridTemplate, isSortableColumn, nextColumnSort, sortByColumn, tableMinWidth, toggleColumn, visibleColumns,
} from '../lib/listColumns';
import { makeTask } from './fixtures';

const make = (over: Partial<CustomField> & Pick<CustomField, 'key' | 'type'>): CustomField => ({
  _id: over.key, name: over.key, options: [], projects: [], required: false, order: 1, archived: false, ...over,
});
const size = make({ key: 'size', type: 'select', name: 'Size' });
const budget = make({ key: 'budget', type: 'number', name: 'Budget' });
const due = make({ key: 'review', type: 'date', name: 'Review' });
const old = make({ key: 'old', type: 'text', name: 'Old', archived: true });
const ids = (columns: { id: string }[]) => columns.map(column => column.id);

describe('visible columns', () => {
  it('shows assignees, priority, status and due date until the person chooses', () => {
    expect(ids(visibleColumns(null, [size]))).toEqual(['assignees', 'priority', 'status', 'dueDate']);
  });

  it('lists built-in columns in table order, then custom fields in field order', () => {
    expect(ids(visibleColumns(['cf:budget', 'release', 'status', 'cf:size'], [size, budget]))).toEqual(['status', 'release', 'cf:size', 'cf:budget']);
  });

  it('an empty choice hides every optional column; unknown and archived ids are dropped', () => {
    expect(visibleColumns([], [size])).toEqual([]);
    expect(ids(visibleColumns(['nope', 'cf:gone', 'cf:old', 'time'], [size, old]))).toEqual(['time']);
  });

  it('custom columns skip archived fields', () => {
    expect(ids(customColumns([size, old]))).toEqual(['cf:size']);
    expect(builtInColumns().map(column => column.id)).toContain('storyPoints');
  });

  it('toggles a column from the defaults or from a saved choice', () => {
    expect(toggleColumn(null, [size], 'storyPoints')).toEqual(['assignees', 'priority', 'status', 'dueDate', 'storyPoints']);
    expect(toggleColumn(null, [size], 'status')).toEqual(['assignees', 'priority', 'dueDate']);
    expect(toggleColumn(['status'], [size], 'cf:size')).toEqual(['status', 'cf:size']);
  });
});

describe('table layout', () => {
  it('builds one track per column between the name and the actions', () => {
    const columns = visibleColumns(['status'], []);
    expect(gridTemplate(columns, false)).toBe('2.5rem minmax(16rem,1fr) 9.5rem 4.5rem');
    expect(gridTemplate(columns, true)).toBe('2.5rem 2.5rem minmax(16rem,1fr) 9.5rem 4.5rem');
  });

  it('grows the minimum width with every column', () => {
    const few = tableMinWidth(visibleColumns(['status'], []), false);
    const many = tableMinWidth(visibleColumns(['status', 'cf:size', 'cf:budget'], [size, budget]), false);
    expect(many).toBeGreaterThan(few + 20);
    expect(tableMinWidth(visibleColumns(['status'], []), true)).toBeGreaterThan(few);
  });
});

describe('sorting by a custom column', () => {
  const a = makeTask({ custom: { budget: 30, review: '2026-03-01' } });
  const b = makeTask({ custom: { budget: 5, review: '2026-01-15' } });
  const c = makeTask();
  const d = makeTask({ custom: { budget: 100, review: '2026-12-31' } });

  it('only numbers and dates are sortable', () => {
    const [sizeColumn, budgetColumn, dueColumn] = customColumns([size, budget, due]);
    expect(isSortableColumn(sizeColumn)).toBe(false);
    expect(isSortableColumn(budgetColumn)).toBe(true);
    expect(isSortableColumn(dueColumn)).toBe(true);
  });

  it('sorts numbers numerically, with empty values last either way', () => {
    expect(sortByColumn([a, b, c, d], budget, 'asc').map(task => task._id)).toEqual([b._id, a._id, d._id, c._id]);
    expect(sortByColumn([a, b, c, d], budget, 'desc').map(task => task._id)).toEqual([d._id, a._id, b._id, c._id]);
  });

  it('sorts dates and leaves the input untouched', () => {
    const input = [a, b, d];
    expect(sortByColumn(input, due, 'asc').map(task => task._id)).toEqual([b._id, a._id, d._id]);
    expect(input.map(task => task._id)).toEqual([a._id, b._id, d._id]);
  });

  it('cycles ascending, descending, off', () => {
    const first = nextColumnSort(null, 'cf:budget');
    expect(first).toEqual({ id: 'cf:budget', direction: 'asc' });
    const second = nextColumnSort(first, 'cf:budget');
    expect(second).toEqual({ id: 'cf:budget', direction: 'desc' });
    expect(nextColumnSort(second, 'cf:budget')).toBeNull();
    expect(nextColumnSort(second, 'cf:review')).toEqual({ id: 'cf:review', direction: 'asc' });
  });
});
