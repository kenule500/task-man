// Columns of the List view's table: the built-in optional ones plus one per active custom field.
// Which are visible is a per-workspace preference (`utils/preferences.ts`); this file holds the pure rules.
import type { CustomField } from '@/features/fields/types';
import { isEmptyValue } from '@/features/fields/lib/fields';
import type { Task } from '../types';

export interface ListColumn {
  /** `assignees`, `status`... for built-in columns, `cf:<field key>` for custom fields. */
  id: string;
  /** Text of the column header. */
  header: string;
  /** Text in the Columns menu. */
  menuLabel: string;
  /** Track width in rem. */
  width: number;
  /** The custom field of a custom column. */
  field?: CustomField;
}

/** Built-in optional columns in table order; `byDefault` ones show until the person chooses otherwise. */
const BUILT_IN: readonly { column: ListColumn; byDefault: boolean }[] = [
  { column: { id: 'assignees', header: 'Assignees', menuLabel: 'Assignees', width: 6 }, byDefault: true },
  { column: { id: 'priority', header: 'Priority', menuLabel: 'Priority', width: 7.5 }, byDefault: true },
  { column: { id: 'status', header: 'Status', menuLabel: 'Status', width: 9.5 }, byDefault: true },
  { column: { id: 'dueDate', header: 'Due Date', menuLabel: 'Due date', width: 9.5 }, byDefault: true },
  { column: { id: 'storyPoints', header: 'Points', menuLabel: 'Story points', width: 5.5 }, byDefault: false },
  { column: { id: 'release', header: 'Release', menuLabel: 'Release', width: 9 }, byDefault: false },
  { column: { id: 'time', header: 'Time', menuLabel: 'Estimate / logged time', width: 8 }, byDefault: false },
];

const CUSTOM_PREFIX = 'cf:';
const CUSTOM_WIDTH = 10.5;

export const customColumnId = (key: string): string => `${CUSTOM_PREFIX}${key}`;

/** The built-in optional columns, in table order. */
export const builtInColumns = (): ListColumn[] => BUILT_IN.map(item => item.column);

/** One column per active custom field, in the fields' order. */
export const customColumns = (fields: readonly CustomField[]): ListColumn[] =>
  fields.filter(field => !field.archived).map(field => ({
    id: customColumnId(field.key), header: field.name, menuLabel: field.name, width: CUSTOM_WIDTH, field,
  }));

/** The columns shown for a stored choice (null = never chosen = the defaults). Unknown ids are dropped. */
export const visibleColumns = (stored: readonly string[] | null, fields: readonly CustomField[]): ListColumn[] => {
  const wanted = stored ? new Set(stored) : null;
  const builtIn = BUILT_IN.filter(item => (wanted ? wanted.has(item.column.id) : item.byDefault)).map(item => item.column);
  const custom = customColumns(fields).filter(column => wanted?.has(column.id));
  return [...builtIn, ...custom];
};

/** The stored choice after switching `id` on or off. */
export const toggleColumn = (stored: readonly string[] | null, fields: readonly CustomField[], id: string): string[] => {
  const ids = visibleColumns(stored, fields).map(column => column.id);
  return ids.includes(id) ? ids.filter(item => item !== id) : [...ids, id];
};

/** CSS `grid-template-columns` of a row: selection, done, name, the chosen columns, actions. */
export const gridTemplate = (columns: readonly ListColumn[], selectable: boolean): string =>
  [
    ...(selectable ? ['2.5rem'] : []),
    '2.5rem',
    'minmax(16rem,1fr)',
    ...columns.map(column => `${column.width}rem`),
    '4.5rem',
  ].join(' ');

/** Narrowest table in rem that keeps every column readable (the list scrolls sideways beyond the page). */
export const tableMinWidth = (columns: readonly ListColumn[], selectable: boolean): number => {
  const tracks = (selectable ? 2.5 : 0) + 2.5 + 16 + columns.reduce((sum, column) => sum + column.width, 0) + 4.5;
  // 1rem gap between tracks, 1.5rem padding on both sides
  const gaps = columns.length + (selectable ? 4 : 3);
  return tracks + gaps + 3;
};

// ---------------------------------------------------------------------------
// Sorting by a custom number or date column
// ---------------------------------------------------------------------------

export type SortDirection = 'asc' | 'desc';
export interface ColumnSort {
  id: string;
  direction: SortDirection;
}

/** Only numbers and dates have an order everyone agrees on. */
export const isSortableColumn = (column: ListColumn): boolean => column.field?.type === 'number' || column.field?.type === 'date';

/** Clicking a header: ascending, then descending, then back to the list's own order. */
export const nextColumnSort = (current: ColumnSort | null, id: string): ColumnSort | null => {
  if (current?.id !== id) return { id, direction: 'asc' };
  return current.direction === 'asc' ? { id, direction: 'desc' } : null;
};

/** `tasks` ordered by the field's value; tasks without a value stay last in either direction. */
export const sortByColumn = (tasks: Task[], field: CustomField, direction: SortDirection): Task[] => {
  const sign = direction === 'asc' ? 1 : -1;
  const numeric = field.type === 'number';
  return [...tasks].sort((a, b) => {
    const left = a.custom?.[field.key];
    const right = b.custom?.[field.key];
    const leftEmpty = isEmptyValue(left);
    const rightEmpty = isEmptyValue(right);
    if (leftEmpty || rightEmpty) return Number(leftEmpty) - Number(rightEmpty);
    return sign * (numeric ? Number(left) - Number(right) : String(left).localeCompare(String(right)));
  });
};
