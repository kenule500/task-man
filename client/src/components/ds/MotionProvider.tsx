import type { ReactNode } from 'react';
import { LazyMotion, MotionConfig } from 'motion/react';

// Wraps the parts of the app that animate layout and drag with the `motion` package (the board). It is not
// exported from the ds index on purpose: importing it is what pulls the library into a chunk, and only lazily
// loaded screens should do that. Features (layout, drag, gestures) arrive after the page is idle.

const whenIdle = () =>
  new Promise<void>(resolve => {
    if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(() => resolve(), { timeout: 2500 });
    else window.setTimeout(resolve, 500);
  });

const loadFeatures = () => whenIdle().then(() => import('./motionFeatures')).then(mod => mod.default);

/**
 * `m` components work without features; they just do not animate until the bundle arrives. Reduced motion is honored.
 * Without matchMedia (jsdom in unit tests) the plain components render: no async feature load, no act warnings.
 */
export const MotionProvider = ({ children }: { children: ReactNode }) =>
  typeof window.matchMedia !== 'function' ? (
    <>{children}</>
  ) : (
    <MotionConfig reducedMotion="user">
      <LazyMotion features={loadFeatures}>{children}</LazyMotion>
    </MotionConfig>
  );

export default MotionProvider;
