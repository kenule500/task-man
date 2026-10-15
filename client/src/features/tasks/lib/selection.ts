/** Pure helpers for the multi-select of the list view (ids in display order, selection as an immutable Set). */

export type SelectionState = 'none' | 'some' | 'all';

/** Adds `id` when missing, removes it otherwise. */
export const toggleId = (selected: ReadonlySet<string>, id: string): Set<string> => {
  const next = new Set(selected);
  if (!next.delete(id)) next.add(id);
  return next;
};

/** How much of `visibleIds` is selected (drives the header checkbox and its indeterminate state). */
export const selectionState = (visibleIds: readonly string[], selected: ReadonlySet<string>): SelectionState => {
  if (visibleIds.length === 0) return 'none';
  const count = visibleIds.filter(id => selected.has(id)).length;
  if (count === 0) return 'none';
  return count === visibleIds.length ? 'all' : 'some';
};

/** Header checkbox: selects every visible row, or clears the visible rows when they are all selected. */
export const toggleAll = (visibleIds: readonly string[], selected: ReadonlySet<string>): Set<string> => {
  const next = new Set(selected);
  if (selectionState(visibleIds, selected) === 'all') visibleIds.forEach(id => next.delete(id));
  else visibleIds.forEach(id => next.add(id));
  return next;
};

/** Ids from `from` to `to` (inclusive, either direction) in `orderedIds`; just `[to]` when `from` is unknown. */
export const idsBetween = (orderedIds: readonly string[], from: string | null, to: string): string[] => {
  const end = orderedIds.indexOf(to);
  if (end === -1) return [];
  const start = from === null ? -1 : orderedIds.indexOf(from);
  if (start === -1) return [to];
  return orderedIds.slice(Math.min(start, end), Math.max(start, end) + 1);
};

/** Shift+click: sets every row between the anchor and `target` to the state `select` (the clicked row's new state). */
export const selectRange = (
  orderedIds: readonly string[],
  selected: ReadonlySet<string>,
  anchor: string | null,
  target: string,
  select: boolean,
): Set<string> => {
  const next = new Set(selected);
  for (const id of idsBetween(orderedIds, anchor, target)) {
    if (select) next.add(id);
    else next.delete(id);
  }
  return next;
};

/** Keeps only ids that are still visible; returns the same Set when nothing changed. */
export const pruneSelection = (selected: ReadonlySet<string>, visibleIds: readonly string[]): ReadonlySet<string> => {
  const visible = new Set(visibleIds);
  const kept = [...selected].filter(id => visible.has(id));
  return kept.length === selected.size ? selected : new Set(kept);
};

/** "3 selected" / "1 selected"; empty when nothing is selected. */
export const selectionLabel = (count: number): string => (count > 0 ? `${count} selected` : '');
