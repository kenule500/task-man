import { parseFilterParams, serializeFilters, type TaskView } from '@/features/tasks';
import { parseQuickFilters, serializeQuickFilters } from '@/features/tasks/lib/boardQuickFilters';
import { parseSwimlaneGroup } from '@/features/tasks/lib/swimlanes';
import type { SavedView } from '../types';

/**
 * The part of the task page's URL a saved view keeps: the filters plus the board's quick filters and grouping.
 * Navigation state (`view`, `task`, `new`, the phone's `col`) is left out. Unknown values are dropped.
 */
export const savedQueryFromParams = (params: URLSearchParams): string => {
  const query = serializeFilters(parseFilterParams(params));
  const quickFilters = serializeQuickFilters(parseQuickFilters(params.get('qf')));
  if (quickFilters) query.set('qf', quickFilters);
  const group = parseSwimlaneGroup(params.get('group'));
  if (group !== 'none') query.set('group', group);
  return query.toString();
};

/** Same as `savedQueryFromParams` for a stored query string. */
export const normalizeSavedQuery = (query: string): string => savedQueryFromParams(new URLSearchParams(query));

/** Where applying `view` goes: the layout plus its filters. */
export const viewHref = (slug: string, view: Pick<SavedView, 'view' | 'query'>): string => {
  const params = new URLSearchParams(normalizeSavedQuery(view.query));
  const query = new URLSearchParams({ view: view.view });
  for (const [name, value] of params) query.set(name, value);
  return `/${slug}/tasks?${query.toString()}`;
};

/** True when the page already shows `view` (same layout and same filters). */
export const isViewActive = (view: Pick<SavedView, 'view' | 'query'>, layout: TaskView, params: URLSearchParams): boolean =>
  view.view === layout && normalizeSavedQuery(view.query) === savedQueryFromParams(params);

const byName = (a: SavedView, b: SavedView) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });

/** The views the menu lists: the user's own, then those shared by teammates; each group sorted by name. */
export const groupViews = (views: readonly SavedView[]): { mine: SavedView[]; shared: SavedView[] } => ({
  mine: views.filter(view => view.mine).sort(byName),
  shared: views.filter(view => !view.mine && view.shared).sort(byName),
});

/** Views this user may rename or delete: their own, and shared ones too for people who manage the workspace. */
export const editableViews = (views: readonly SavedView[], canManageShared: boolean): SavedView[] =>
  views.filter(view => view.mine || (canManageShared && view.shared)).sort(byName);

/** Short description of what a view holds, e.g. "Board · status Pending · Assigned to me". */
export const describeView = (view: Pick<SavedView, 'view' | 'query'>): string => {
  const params = new URLSearchParams(normalizeSavedQuery(view.query));
  const parts: string[] = [view.view[0].toUpperCase() + view.view.slice(1)];
  const q = params.get('q');
  if (q) parts.push(`“${q}”`);
  for (const name of ['status', 'priority', 'type', 'label'] as const) {
    const value = params.get(name);
    if (value) parts.push(`${name} ${value}`);
  }
  if (params.get('epic')) parts.push('epic');
  if (params.get('assignedToMe')) parts.push('assigned to me');
  if (params.get('qf')) parts.push('quick filters');
  return parts.join(' · ');
};
