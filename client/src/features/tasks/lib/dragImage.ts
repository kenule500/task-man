import type { DragEvent } from 'react';

/**
 * Replaces the browser's flat drag preview with a lifted copy of the card: tilted a little, larger shadow.
 * The copy lives off-screen for one tick, just long enough for the browser to snapshot it.
 */
export const setLiftedDragImage = (event: DragEvent<HTMLElement>, element: HTMLElement) => {
  const transfer = event.dataTransfer;
  if (typeof transfer?.setDragImage !== 'function' || typeof document === 'undefined') return;
  const box = element.getBoundingClientRect();
  if (box.width === 0) return;
  const ghost = element.cloneNode(true) as HTMLElement;
  Object.assign(ghost.style, {
    position: 'fixed',
    top: '-1000px',
    left: '-1000px',
    width: `${box.width}px`,
    transform: 'rotate(2deg) scale(1.02)',
    boxShadow: 'var(--shadow-overlay)',
    pointerEvents: 'none',
  });
  document.body.appendChild(ghost);
  transfer.setDragImage(ghost, event.clientX - box.left, event.clientY - box.top);
  window.setTimeout(() => ghost.remove(), 0);
};
