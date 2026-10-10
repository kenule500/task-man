// Horizontal swipe on the phone board switches the status column.

/** Finger travel (px) that counts as a swipe. */
export const SWIPE_THRESHOLD = 60;

/**
 * Column step for a finger movement: `1` = next column (swipe left), `-1` = previous (swipe right),
 * `0` = not a swipe. Mostly vertical movements are scrolls and are ignored.
 */
export const swipeStep = (dx: number, dy: number, threshold: number = SWIPE_THRESHOLD): -1 | 0 | 1 => {
  if (Math.abs(dx) < threshold || Math.abs(dx) < Math.abs(dy) * 1.5) return 0;
  return dx < 0 ? 1 : -1;
};

/** `current` moved by `step`, clamped to the list (no wrap-around for swipes). */
export const stepColumn = <T>(columns: readonly T[], current: T, step: -1 | 0 | 1): T => {
  const index = columns.indexOf(current);
  if (index === -1) return columns[0];
  return columns[Math.min(columns.length - 1, Math.max(0, index + step))];
};
