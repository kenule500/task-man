/** Cards shown per Kanban column before "Show more". */
export const BOARD_PAGE_SIZE = 10;

export interface Page<T> {
  /** Items to render: the first `page * size` of `items`. */
  visible: T[];
  shown: number;
  total: number;
  hasMore: boolean;
  /** Items still hidden. */
  remaining: number;
}

/** Cumulative pagination ("load more"): `page` 1 shows the first `size` items, 2 the first `2 * size`... */
export const paginate = <T>(items: readonly T[], page: number, size: number = BOARD_PAGE_SIZE): Page<T> => {
  const safeSize = Math.max(1, Math.floor(size));
  const safePage = Math.max(1, Math.floor(page));
  const visible = items.slice(0, safePage * safeSize);
  const total = items.length;
  return { visible, shown: visible.length, total, hasMore: visible.length < total, remaining: total - visible.length };
};

/** Number of pages needed to show every item. */
export const pageCount = (total: number, size: number = BOARD_PAGE_SIZE): number =>
  Math.max(1, Math.ceil(total / Math.max(1, Math.floor(size))));
