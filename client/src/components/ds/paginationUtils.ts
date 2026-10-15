/** A numbered page or a gap between numbered pages. */
export type PageItem = number | 'ellipsis-start' | 'ellipsis-end';

/**
 * Page numbers to render: first, last, the current page with `siblings` on each side, and an
 * ellipsis wherever pages are skipped. Never skips a single page (shows it instead), so the
 * list is stable in length while moving through the middle.
 */
export const getPageItems = (page: number, pageCount: number, siblings = 1): PageItem[] => {
  const last = Math.max(1, Math.floor(pageCount));
  const current = Math.min(Math.max(1, Math.floor(page)), last);
  const slots = siblings * 2 + 5; // first, last, current, two gaps, siblings
  if (last <= slots) return Array.from({ length: last }, (_, index) => index + 1);

  const left = Math.max(current - siblings, 1);
  const right = Math.min(current + siblings, last);
  const showStartGap = left > 3;
  const showEndGap = right < last - 2;
  const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, index) => from + index);

  if (!showStartGap && showEndGap) return [...range(1, 3 + siblings * 2), 'ellipsis-end', last];
  if (showStartGap && !showEndGap) return [1, 'ellipsis-start', ...range(last - (2 + siblings * 2), last)];
  return [1, 'ellipsis-start', ...range(left, right), 'ellipsis-end', last];
};

/** First and last item number shown on a page (1-based, inclusive); 0–0 when there are no items. */
export const getPageRange = (page: number, pageSize: number, total: number): { start: number; end: number } => {
  if (total <= 0 || pageSize <= 0) return { start: 0, end: 0 };
  const start = Math.min((Math.max(page, 1) - 1) * pageSize + 1, total);
  return { start, end: Math.min(start + pageSize - 1, total) };
};

export const getPageCount = (total: number, pageSize: number): number =>
  pageSize > 0 ? Math.max(1, Math.ceil(total / pageSize)) : 1;
