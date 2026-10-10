import { useCallback, useState, type FocusEvent, type KeyboardEvent, type PointerEvent } from 'react';

/**
 * The data point a chart is describing: set by hovering, or by the arrow keys while the chart has focus.
 * Spread `handlers` on the focusable chart container.
 */
export const useActiveIndex = (count: number, start: 'first' | 'last' = 'first') => {
  const [active, setActive] = useState<number | null>(null);
  const current = active !== null && active < count ? active : null;
  const startIndex = start === 'first' ? 0 : count - 1;

  const onKeyDown = useCallback((event: KeyboardEvent<HTMLElement>) => {
    if (count === 0) return;
    const at = current ?? startIndex;
    let next: number | null | undefined;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = current === null ? startIndex : Math.min(at + 1, count - 1);
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = current === null ? startIndex : Math.max(at - 1, 0);
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = count - 1;
    else if (event.key === 'Escape') next = null;
    if (next === undefined) return;
    event.preventDefault();
    setActive(next);
  }, [count, current, startIndex]);

  const onFocus = useCallback((event: FocusEvent<HTMLElement>) => {
    // Only the container itself: focus moving between children must not reset the point
    if (event.target === event.currentTarget) setActive(previous => previous ?? (count > 0 ? startIndex : null));
  }, [count, startIndex]);

  const onBlur = useCallback((event: FocusEvent<HTMLElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setActive(null);
  }, []);

  const onPointerLeave = useCallback((event: PointerEvent<HTMLElement>) => {
    // A keyboard user who parked the pointer elsewhere keeps their point
    if (!event.currentTarget.contains(document.activeElement)) setActive(null);
  }, []);

  return { active: current, setActive, handlers: { onKeyDown, onFocus, onBlur, onPointerLeave } };
};
