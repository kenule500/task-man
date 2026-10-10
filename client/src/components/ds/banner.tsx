import type { ReactNode } from 'react';
import { AlertCircle, CheckCircle2, Info, TriangleAlert, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { alertVariants, bannerVariants, type BannerVariants } from './variants';

export type BannerTone = 'info' | 'success' | 'warning' | 'danger';

const TONE_TO_ALERT = { info: 'info', success: 'success', warning: 'warning', danger: 'error' } as const;
const ICONS = { info: Info, success: CheckCircle2, warning: TriangleAlert, danger: AlertCircle };

type BannerProps = BannerVariants & {
  tone?: BannerTone;
  title?: ReactNode;
  children: ReactNode;
  /** Optional call to action, e.g. a Button or link. Keep it to one. */
  action?: ReactNode;
  /** Shows a dismiss button. The banner is removed by the caller. */
  onDismiss?: () => void;
  dismissLabel?: string;
  className?: string;
};

/**
 * Page-level message that sits above the content (offline, update available, sprint ending).
 * Use `Alert` for feedback next to a form or panel. Danger is announced at once (`role="alert"`), the rest politely.
 */
export const Banner = ({
  tone = 'info', title, children, action, onDismiss, dismissLabel = 'Dismiss', sticky, rounded, className,
}: BannerProps) => {
  const Icon = ICONS[tone];
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn(alertVariants({ tone: TONE_TO_ALERT[tone] }), bannerVariants({ sticky, rounded }), className)}
    >
      <Icon className="mt-0.5 size-4 shrink-0 sm:mt-0" aria-hidden />
      <div className="min-w-0 flex-1 sm:flex sm:flex-wrap sm:items-center sm:gap-x-3 sm:gap-y-1">
        {title && <p className="font-semibold">{title}</p>}
        <div>{children}</div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label={dismissLabel}
          className="-m-1.5 flex size-8 shrink-0 items-center justify-center rounded-md opacity-70 outline-none hover:opacity-100 focus-visible:outline-2 focus-visible:outline-focus"
        >
          <X className="size-4" aria-hidden />
        </button>
      )}
    </div>
  );
};
