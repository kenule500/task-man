import { useCallback, useState } from 'react';

/**
 * Pixel width of the chart box, never below `minWidth` (narrower screens scroll). Charts draw in these units, so
 * their viewBox matches the screen and 12px labels stay 12px at every width.
 */
export const useChartWidth = (minWidth: number, fallback = 640) => {
  const [width, setWidth] = useState(fallback);
  const ref = useCallback((node: HTMLDivElement | null) => {
    if (!node || typeof ResizeObserver === 'undefined') return undefined;
    const measure = () => {
      const next = Math.round(node.getBoundingClientRect().width);
      if (next > 0) setWidth(next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return [ref, Math.max(minWidth, width)] as const;
};
