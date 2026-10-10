import {
  Children, cloneElement, isValidElement, useEffect, useRef, useState,
  type CSSProperties, type ElementType, type PointerEvent as ReactPointerEvent, type ReactElement, type ReactNode,
} from 'react';
import { cn } from '@/lib/utils';
import { useFinePointer, useReducedMotionSafe } from '@/lib/motion';

// Motion components. Rules (DESIGN.md → Motion): animate transform and opacity, never block input, exits faster
// than entries, and everything is reduced-motion safe. These are CSS- and DOM-driven (no animation runtime), so
// they cost almost nothing in the first bundle; layout and drag animation uses the `motion` package where it
// pays off (the board, see MotionProvider.tsx).

// ---------------------------------------------------------------------------
// Entrances (CSS)
// ---------------------------------------------------------------------------

type Tag = ElementType;

interface FadeInProps {
  children: ReactNode;
  /** Delay in milliseconds */
  delay?: number;
  as?: Tag;
  className?: string;
  style?: CSSProperties;
}

/** Fades and rises 8px on mount. Plays once; reduced motion shows the content immediately. */
export const FadeIn = ({ children, delay = 0, as: Component = 'div', className, style }: FadeInProps) => (
  <Component className={cn('motion-safe:animate-tm-rise', className)} style={{ animationDelay: delay ? `${delay}ms` : undefined, ...style }}>
    {children}
  </Component>
);

const STAGGER_STEP_MS = 45;
const STAGGER_MAX_INDEX = 10;

interface StaggerItemProps {
  children: ReactNode;
  /** Set by Stagger; pass it yourself only outside a Stagger */
  index?: number;
  as?: Tag;
  className?: string;
}

/** One entrance-animated child of a Stagger. */
export const StaggerItem = ({ children, index = 0, as: Component = 'div', className }: StaggerItemProps) => (
  <Component
    className={cn('motion-safe:animate-tm-rise', className)}
    style={{ animationDelay: `${Math.min(index, STAGGER_MAX_INDEX) * STAGGER_STEP_MS}ms` }}
  >
    {children}
  </Component>
);

interface StaggerProps {
  children: ReactNode;
  as?: Tag;
  className?: string;
  [key: string]: unknown;
}

/**
 * List or grid whose `StaggerItem` children rise one after another on first mount (45ms apart, at most 10 steps).
 * Only direct `StaggerItem` children are indexed.
 */
export const Stagger = ({ children, as: Component = 'div', className, ...rest }: StaggerProps) => {
  let position = 0;
  const indexed = Children.map(children, child => {
    if (!isValidElement(child) || child.type !== StaggerItem) return child;
    const item = child as ReactElement<StaggerItemProps>;
    return cloneElement(item, { index: item.props.index ?? position++ });
  });
  return <Component className={className} {...rest}>{indexed}</Component>;
};

// ---------------------------------------------------------------------------
// Numbers
// ---------------------------------------------------------------------------

interface AnimatedNumberProps {
  value: number;
  /** Text for a number; default is the rounded integer */
  format?: (value: number) => string;
  /** Count-up time in milliseconds */
  duration?: number;
  className?: string;
}

const defaultFormat = (value: number) => String(Math.round(value));

/**
 * Counts up to `value` the first time it scrolls into view and whenever the value changes. Tabular figures keep
 * the width steady. Screen readers always get the final value; without IntersectionObserver or with reduced motion
 * the final value is rendered immediately.
 */
export const AnimatedNumber = ({ value, format = defaultFormat, duration = 700, className }: AnimatedNumberProps) => {
  const reduced = useReducedMotionSafe();
  const canAnimate = !reduced && typeof IntersectionObserver !== 'undefined' && typeof requestAnimationFrame === 'function';
  const [shown, setShown] = useState(() => (canAnimate ? 0 : value));
  const fromRef = useRef(canAnimate ? 0 : value);
  const elementRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!canAnimate || !elementRef.current) return;
    let frame = 0;
    const run = () => {
      const from = fromRef.current;
      const startedAt = performance.now();
      const tick = (now: number) => {
        const progress = Math.min(1, (now - startedAt) / duration);
        const next = progress === 1 ? value : from + (value - from) * (1 - (1 - progress) ** 3);
        fromRef.current = next;
        setShown(next);
        if (progress < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    };
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        observer.disconnect();
        run();
      }
    });
    observer.observe(elementRef.current);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [canAnimate, value, duration]);

  const current = canAnimate ? shown : value;
  return (
    <span ref={elementRef} className={cn('tabular-nums', className)}>
      {current === value ? format(value) : (
        <>
          <span aria-hidden>{format(current)}</span>
          <span className="sr-only">{format(value)}</span>
        </>
      )}
    </span>
  );
};

// ---------------------------------------------------------------------------
// 3D tilt and press
// ---------------------------------------------------------------------------

type TiltTag = 'div' | 'li' | 'article' | 'section';

interface TiltCardProps {
  children: ReactNode;
  as?: TiltTag;
  /** Maximum rotation in degrees (default 6) */
  max?: number;
  className?: string;
  /** Radius class for the light sheen so it stays inside the card shape */
  sheenClassName?: string;
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/**
 * Subtle 3D tilt toward the pointer with a light sheen that follows it. The pointer position is written to CSS
 * variables (no re-render); CSS smooths it and springs back on leave. Only for fine pointers without reduced
 * motion. Hover and keyboard focus both lift the card 2px.
 */
export const TiltCard = ({ children, as = 'div', max = 6, className, sheenClassName = 'rounded-xl' }: TiltCardProps) => {
  const Component = as as ElementType;
  const ref = useRef<HTMLElement>(null);
  const finePointer = useFinePointer();
  const reduced = useReducedMotionSafe();
  const enabled = finePointer && !reduced;

  const track = (event: ReactPointerEvent<HTMLElement>) => {
    const element = ref.current;
    if (!enabled || !element || event.pointerType === 'touch') return;
    const box = element.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) return;
    const x = clamp01((event.clientX - box.left) / box.width);
    const y = clamp01((event.clientY - box.top) / box.height);
    element.style.setProperty('--tilt-x', `${((0.5 - y) * 2 * max).toFixed(2)}deg`);
    element.style.setProperty('--tilt-y', `${((x - 0.5) * 2 * max).toFixed(2)}deg`);
    element.style.setProperty('--sheen-x', `${(x * 100).toFixed(1)}%`);
    element.style.setProperty('--sheen-y', `${(y * 100).toFixed(1)}%`);
    element.dataset.tilting = 'true';
  };
  const release = () => {
    const element = ref.current;
    if (!element) return;
    delete element.dataset.tilting;
    ['--tilt-x', '--tilt-y', '--sheen-x', '--sheen-y'].forEach(name => element.style.removeProperty(name));
  };

  return (
    <Component
      ref={ref}
      onPointerMove={track}
      onPointerLeave={release}
      className={cn(
        'motion-safe:transition-[transform,translate] motion-safe:duration-(--motion-slow) motion-safe:ease-(--ease-spring-soft) motion-safe:hover:-translate-y-0.5 motion-safe:focus-within:-translate-y-0.5',
        enabled && '[transform:perspective(900px)_rotateX(var(--tilt-x,0deg))_rotateY(var(--tilt-y,0deg))] data-[tilting=true]:duration-100 data-[tilting=true]:ease-out',
        className,
      )}
    >
      {children}
      {enabled && (
        <span
          aria-hidden
          style={{ backgroundImage: 'radial-gradient(260px circle at var(--sheen-x, 50%) var(--sheen-y, 50%), rgb(255 255 255 / 0.24), transparent 65%)' }}
          className={cn('pointer-events-none absolute inset-0 z-[1] opacity-0 transition-opacity duration-(--motion-base) in-data-[tilting=true]:opacity-100', sheenClassName)}
        />
      )}
    </Component>
  );
};

/** Wraps a button or link: scales to 0.98 while pressed (no scale under reduced motion). */
export const Pressable = ({ children, className }: { children: ReactNode; className?: string }) => (
  <div className={cn('inline-block motion-safe:transition-transform motion-safe:duration-(--motion-fast) motion-safe:ease-(--ease-spring-soft) motion-safe:active:scale-[0.98]', className)}>
    {children}
  </div>
);

// ---------------------------------------------------------------------------
// Completion burst
// ---------------------------------------------------------------------------

const SPARK_ANGLES = [0, 60, 120, 180, 240, 300];

/**
 * One-shot check burst (a ring and six sparks) for a task that was just completed. Mount it inside a `relative`
 * element, remount with a new `key` to replay. Removes itself when done; renders nothing under reduced motion.
 */
export const CheckBurst = ({ className, onDone }: { className?: string; onDone?: () => void }) => {
  const reduced = useReducedMotionSafe();
  const [done, setDone] = useState(false);
  if (reduced || done) return null;
  return (
    <span aria-hidden data-testid="check-burst" className={cn('pointer-events-none absolute inset-0 flex items-center justify-center', className)}>
      <span className="absolute size-full rounded-full border-2 border-success-dot animate-tm-ring" onAnimationEnd={() => { setDone(true); onDone?.(); }} />
      {SPARK_ANGLES.map(angle => (
        <span key={angle} style={{ '--a': `${angle}deg` } as CSSProperties} className="absolute size-1 rounded-full bg-success-dot animate-tm-spark" />
      ))}
    </span>
  );
};
