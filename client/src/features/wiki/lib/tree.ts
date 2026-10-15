import { MAX_PAGE_DEPTH, type WikiMoveKind, type WikiMovePlan, type WikiPage, type WikiPageSummary } from '../types';

export interface TreeRow {
  page: WikiPageSummary;
  /** 0 = top level */
  depth: number;
  hasChildren: boolean;
  expanded: boolean;
  /** 1-based position among its siblings and the number of siblings (for screen readers) */
  posInSet: number;
  setSize: number;
}

const byOrder = (a: WikiPageSummary, b: WikiPageSummary) =>
  a.position - b.position || a.title.localeCompare(b.title);

/** Children grouped by parent id ('' = top level); a page whose parent is missing is treated as top level. */
export const groupByParent = (pages: readonly WikiPageSummary[]): Map<string, WikiPageSummary[]> => {
  const ids = new Set(pages.map(page => page._id));
  const groups = new Map<string, WikiPageSummary[]>();
  for (const page of pages) {
    const key = page.parent && ids.has(page.parent) ? page.parent : '';
    groups.set(key, [...(groups.get(key) ?? []), page]);
  }
  for (const list of groups.values()) list.sort(byOrder);
  return groups;
};

/** The visible rows of the tree in display order, honouring which parents are expanded. */
export const visibleRows = (pages: readonly WikiPageSummary[], expanded: ReadonlySet<string>): TreeRow[] => {
  const groups = groupByParent(pages);
  const rows: TreeRow[] = [];
  const walk = (parentKey: string, depth: number, seen: ReadonlySet<string>) => {
    const siblings = groups.get(parentKey) ?? [];
    siblings.forEach((page, index) => {
      if (seen.has(page._id)) return;
      const hasChildren = (groups.get(page._id)?.length ?? 0) > 0;
      const isOpen = hasChildren && expanded.has(page._id);
      rows.push({ page, depth, hasChildren, expanded: isOpen, posInSet: index + 1, setSize: siblings.length });
      if (isOpen) walk(page._id, depth + 1, new Set([...seen, page._id]));
    });
  };
  walk('', 0, new Set());
  return rows;
};

/** Pages from the top level down to the direct parent of `id` (empty for a top-level page). */
export const ancestorsOf = (pages: readonly WikiPageSummary[], id: string): WikiPageSummary[] => {
  const byId = new Map(pages.map(page => [page._id, page]));
  const chain: WikiPageSummary[] = [];
  const seen = new Set<string>([id]);
  let current = byId.get(id)?.parent ?? null;
  while (current && !seen.has(current)) {
    const page = byId.get(current);
    if (!page) break;
    seen.add(current);
    chain.unshift(page);
    current = page.parent;
  }
  return chain;
};

/** Ids that must be expanded so that `id` is visible. */
export const expandedToReveal = (pages: readonly WikiPageSummary[], id: string): string[] =>
  ancestorsOf(pages, id).map(page => page._id);

/** Levels of the page itself plus everything above it (top level = 1). */
export const depthOf = (pages: readonly WikiPageSummary[], id: string): number =>
  ancestorsOf(pages, id).length + 1;

/** Levels below the page (a page without children = 0). */
export const heightBelow = (pages: readonly WikiPageSummary[], id: string): number => {
  const groups = groupByParent(pages);
  const walk = (current: string, seen: ReadonlySet<string>): number => {
    const kids = (groups.get(current) ?? []).filter(kid => !seen.has(kid._id));
    return kids.length === 0 ? 0 : 1 + Math.max(...kids.map(kid => walk(kid._id, new Set([...seen, kid._id]))));
  };
  return walk(id, new Set([id]));
};

/**
 * Where a page lands for a menu move, or null when that move is not possible.
 * `index` counts the siblings of the new parent without the page itself (what the API expects).
 */
export const planMove = (pages: readonly WikiPageSummary[], id: string, kind: WikiMoveKind): WikiMovePlan | null => {
  const page = pages.find(item => item._id === id);
  if (!page) return null;
  const known = new Set(pages.map(item => item._id));
  const groups = groupByParent(pages);
  const parentKey = page.parent && known.has(page.parent) ? page.parent : '';
  const siblings = groups.get(parentKey) ?? [];
  const index = siblings.findIndex(item => item._id === id);
  const parent = parentKey || null;

  switch (kind) {
    case 'up':
      return index > 0 ? { parent, index: index - 1 } : null;
    case 'down':
      return index >= 0 && index < siblings.length - 1 ? { parent, index: index + 1 } : null;
    case 'indent': {
      const previous = siblings[index - 1];
      if (!previous) return null;
      if (depthOf(pages, previous._id) + 1 + heightBelow(pages, id) > MAX_PAGE_DEPTH) return null;
      return { parent: previous._id, index: (groups.get(previous._id) ?? []).length };
    }
    case 'outdent': {
      if (!parent) return null;
      const parentPage = pages.find(item => item._id === parent);
      const grandKey = parentPage?.parent && known.has(parentPage.parent) ? parentPage.parent : '';
      const position = (groups.get(grandKey) ?? []).findIndex(item => item._id === parent);
      return { parent: grandKey || null, index: position + 1 };
    }
  }
};

/** Whether a new page can be added under `parentId` (null = top level) without passing the depth limit. */
export const canAddChild = (pages: readonly WikiPageSummary[], parentId: string | null): boolean =>
  parentId === null || depthOf(pages, parentId) < MAX_PAGE_DEPTH;

/** The tree entry of a full page (keeps the list in step after a save, without reloading it). */
export const summaryOf = (page: WikiPage): WikiPageSummary => {
  const { content, mentions, ...summary } = page;
  void content;
  void mentions;
  return summary;
};
