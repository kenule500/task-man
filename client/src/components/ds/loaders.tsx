import type { ComponentProps } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

// Loaders: small, CSS-only (no motion runtime), `currentColor`, and still when the user prefers reduced motion
// (the global rule in index.css stops every animation; the text label keeps carrying the state).

const spinnerVariants = cva('shrink-0', {
  variants: {
    size: { xs: 'size-3', sm: 'size-4', md: 'size-5', lg: 'size-8' },
  },
  defaultVariants: { size: 'sm' },
});

type SpinnerProps = Omit<ComponentProps<'span'>, 'children'> & VariantProps<typeof spinnerVariants> & {
  /** Accessible name; default "Loading" */
  label?: string;
  /** Hide it from assistive tech, for spinners inside a control that already announces its busy state */
  decorative?: boolean;
};

/** Ring spinner in `currentColor`. A polite status with a label, unless `decorative`. */
export const Spinner = ({ size, label = 'Loading', decorative = false, className, ...props }: SpinnerProps) => (
  <span
    role={decorative ? undefined : 'status'}
    aria-label={decorative ? undefined : label}
    aria-hidden={decorative ? true : undefined}
    data-slot="spinner"
    className={cn('inline-flex', className)}
    {...props}
  >
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className={cn(spinnerVariants({ size }), 'motion-safe:animate-spin')}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.2" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  </span>
);

/** Three bouncing dots for inline waits ("Saving…", chat-like pending states). */
export const DotsLoader = ({ label = 'Loading', className, ...props }: Omit<ComponentProps<'span'>, 'children'> & { label?: string }) => (
  <span role="status" aria-label={label} className={cn('inline-flex items-center gap-1', className)} {...props}>
    {[0, 1, 2].map(index => (
      <span
        key={index}
        aria-hidden
        style={{ animationDelay: `${index * 160}ms` }}
        className="size-1.5 rounded-full bg-current motion-safe:animate-tm-dot"
      />
    ))}
  </span>
);

/**
 * Indeterminate bar fixed to the top of the viewport. Mount it while something loads (it is the Suspense
 * fallback of lazy routes); it fades in after 160ms so quick loads never flash it.
 */
export const TopProgressBar = ({ label = 'Loading page', className }: { label?: string; className?: string }) => (
  <div
    role="progressbar"
    aria-label={label}
    aria-busy="true"
    className={cn(
      'pointer-events-none fixed inset-x-0 top-0 z-(--z-tooltip) h-0.5 overflow-hidden bg-primary/15 motion-safe:animate-tm-delayed-in',
      className,
    )}
  >
    <div className="h-full w-2/5 rounded-full bg-primary motion-safe:animate-tm-bar motion-reduce:w-full motion-reduce:opacity-60" />
  </div>
);

/** The TaskMan mark (blue tile with a check). Decorative. */
export const BrandMark = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 64 64" fill="none" aria-hidden className={className}>
    <rect width="64" height="64" rx="14" fill="var(--color-primary)" />
    <path d="M18 33.5 28 43.5 46.5 22" stroke="#fff" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

interface PageLoaderProps {
  label?: string;
  /** Fill the viewport (default) or just the parent */
  fullscreen?: boolean;
  className?: string;
}

/**
 * Branded full-page wait: the logo tile flips in a CSS 3D perspective over a soft shadow, with a "Loading…" label.
 * Appears after a short delay (no flash on fast loads) and sits still under reduced motion.
 */
export const PageLoader = ({ label = 'Loading…', fullscreen = true, className }: PageLoaderProps) => (
  <div
    role="status"
    aria-live="polite"
    className={cn(
      'flex flex-col items-center justify-center gap-5 bg-canvas p-6 text-text-subtle motion-safe:animate-tm-delayed-in',
      fullscreen ? 'min-h-dvh' : 'min-h-[50vh]',
      className,
    )}
  >
    <div aria-hidden className="relative pb-6 [perspective:520px]">
      <div className="relative size-14 [transform-style:preserve-3d] motion-safe:animate-tm-flip">
        <BrandMark className="absolute inset-0 size-full rounded-[14px] shadow-raised [backface-visibility:hidden]" />
        <span className="absolute inset-0 flex items-center justify-center rounded-[14px] bg-surface-raised text-primary shadow-raised ring-1 ring-border-subtle [backface-visibility:hidden] [transform:rotateY(180deg)]">
          <svg viewBox="0 0 64 64" fill="none" className="size-9" aria-hidden>
            <path d="M18 33.5 28 43.5 46.5 22" stroke="currentColor" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </div>
      <span className="absolute inset-x-1 bottom-0 h-2.5 rounded-[50%] bg-black opacity-20 blur-sm motion-safe:animate-tm-flip-shadow" />
    </div>
    <p className="text-sm font-medium">{label}</p>
  </div>
);
