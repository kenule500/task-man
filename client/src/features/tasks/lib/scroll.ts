// Scroll helpers: reduced-motion aware behaviour and the active column of the phone board.

/**
 * Index of the column whose left edge is closest to the scroller's left edge.
 * `lefts` are the columns' `getBoundingClientRect().left`; returns 0 when empty.
 */
export const closestColumnIndex = (lefts: number[], containerLeft: number): number => {
  let best = 0;
  let bestDistance = Infinity;
  lefts.forEach((left, index) => {
    const distance = Math.abs(left - containerLeft);
    if (distance < bestDistance) {
      best = index;
      bestDistance = distance;
    }
  });
  return best;
};

/** Smooth scrolling unless the user asked for reduced motion (or matchMedia is missing, as in jsdom). */
export const scrollBehavior = (): ScrollBehavior => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'auto';
  return window.matchMedia('(prefers-reduced-motion: reduce)')?.matches ? 'auto' : 'smooth';
};
