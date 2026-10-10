import { useSyncExternalStore } from 'react';

// Motion tokens for JavaScript-driven animation (the `motion` package). CSS uses the matching
// `--motion-*` and `--ease-*` variables in index.css. Rules: DESIGN.md → Motion.

/** Durations in seconds (motion's unit). Mirrors `--motion-fast|base|slow` (120/200/320ms). */
export const DURATION = { fast: 0.12, base: 0.2, slow: 0.32 } as const;

/** Cubic-bezier control points, the same curves as `--ease-standard|enter|exit`. */
export const EASE = {
  standard: [0.2, 0, 0, 1],
  enter: [0, 0, 0.2, 1],
  exit: [0.4, 0, 1, 1],
} as const;

/** Springs: `snappy` for press and toggle feedback, `gentle` for position and tilt. */
export const SPRING = {
  snappy: { type: 'spring', stiffness: 520, damping: 34, mass: 0.8 },
  gentle: { type: 'spring', stiffness: 180, damping: 22, mass: 1 },
} as const;

const REDUCED_QUERY = '(prefers-reduced-motion: reduce)';
const FINE_POINTER_QUERY = '(hover: hover) and (pointer: fine)';

const matches = (query: string): boolean =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches;

const subscribeTo = (query: string) => (onChange: () => void) => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => undefined;
  const list = window.matchMedia(query);
  list.addEventListener?.('change', onChange);
  return () => list.removeEventListener?.('change', onChange);
};

const subscribeReduced = subscribeTo(REDUCED_QUERY);
const subscribeFine = subscribeTo(FINE_POINTER_QUERY);

/**
 * True when the user asked the OS for less motion. Components then fade only (or skip the effect).
 * The app has no separate in-app motion setting; the OS preference is the single source.
 */
export const useReducedMotionSafe = (): boolean =>
  useSyncExternalStore(subscribeReduced, () => matches(REDUCED_QUERY), () => false);

/** True on devices with a hover-capable fine pointer (mouse, trackpad); false on touch. */
export const useFinePointer = (): boolean =>
  useSyncExternalStore(subscribeFine, () => matches(FINE_POINTER_QUERY), () => false);
