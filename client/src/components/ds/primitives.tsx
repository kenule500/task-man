import type { ComponentProps, ReactNode } from 'react';
import { AlertCircle, CheckCircle2, Info, TriangleAlert, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import {
  alertVariants, fieldMessageId, getInitials, iconTileVariants, surfaceVariants, tagVariants,
  type AlertVariants, type IconTileVariants, type SurfaceVariants, type TagVariants,
} from './variants';

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  /** Primary actions, right-aligned on desktop and full width below on mobile */
  actions?: ReactNode;
  /** Heading element of the title. Keep the default (1) on real pages; documentation demos use 3. */
  headingLevel?: 1 | 2 | 3;
  className?: string;
}

/** Page title block: one per screen, the `h1` of the page. */
export const PageHeader = ({ title, description, actions, headingLevel = 1, className }: PageHeaderProps) => {
  const Heading = `h${headingLevel}` as 'h1' | 'h2' | 'h3';
  return (
  <header className={cn('flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between', className)}>
    <div className="min-w-0">
      <Heading className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">{title}</Heading>
      {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
    </div>
    {actions && <div className="flex shrink-0 flex-wrap items-center gap-2 [&>*]:flex-1 sm:[&>*]:flex-none">{actions}</div>}
  </header>
  );
};

type SurfaceProps = ComponentProps<'div'> & SurfaceVariants & { as?: 'div' | 'section' | 'article' };

/** White card: the container for page sections, lists and widgets. */
export const Surface = ({ as: Tag = 'div', radius, padding, interactive, className, ...props }: SurfaceProps) => (
  <Tag className={cn(surfaceVariants({ radius, padding, interactive }), className)} {...props} />
);

interface SectionHeaderProps {
  title: ReactNode;
  /** Small count shown next to the title */
  count?: number;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}

/** Heading row inside a Surface (title, optional count and action). */
export const SectionHeader = ({ title, count, icon, action, className }: SectionHeaderProps) => (
  <div className={cn('mb-4 flex items-center justify-between gap-3', className)}>
    <h2 className="flex min-w-0 items-center gap-2 text-sm font-semibold text-slate-900">
      {icon}
      <span className="truncate">{title}</span>
      {count !== undefined && (
        <span className="rounded-md border border-slate-200 bg-slate-50 px-1.5 text-xs font-medium tabular-nums text-slate-500">
          {count}
        </span>
      )}
    </h2>
    {action}
  </div>
);

// ---------------------------------------------------------------------------
// Feedback
// ---------------------------------------------------------------------------

const ALERT_ICONS = { info: Info, success: CheckCircle2, warning: TriangleAlert, error: AlertCircle };

type AlertProps = AlertVariants & {
  children: ReactNode;
  title?: ReactNode;
  /** Shows a dismiss button */
  onDismiss?: () => void;
  className?: string;
};

/** Inline message. Errors are announced immediately (role="alert"), others politely. */
export const Alert = ({ tone = 'info', title, children, onDismiss, className }: AlertProps) => {
  const Icon = ALERT_ICONS[tone ?? 'info'];
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={cn(alertVariants({ tone }), className)}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        <div>{children}</div>
      </div>
      {onDismiss && (
        <button type="button" onClick={onDismiss} aria-label="Dismiss" className="-m-1 rounded p-1 opacity-70 hover:opacity-100">
          <X className="size-4" />
        </button>
      )}
    </div>
  );
};

interface EmptyStateProps {
  title: string;
  description: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}

/** Explains why a list is empty and what to do next. */
export const EmptyState = ({ title, description, icon, action, className }: EmptyStateProps) => (
  <div className={cn('px-4 py-16 text-center sm:py-20', className)}>
    <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-slate-100 text-slate-400 [&_svg]:size-8">
      {icon ?? <Info />}
    </div>
    <h3 className="mb-1 text-lg font-semibold text-slate-700">{title}</h3>
    <p className="mx-auto max-w-md text-sm text-slate-500">{description}</p>
    {action && <div className="mt-5 flex justify-center">{action}</div>}
  </div>
);

interface SkeletonCardsProps {
  count?: number;
  /** Grid classes, e.g. "md:grid-cols-2 lg:grid-cols-4" */
  columns?: string;
  className?: string;
}

/** Placeholder cards shown while a page loads (prefer over spinners). */
export const SkeletonCards = ({ count = 4, columns = 'md:grid-cols-2 lg:grid-cols-4', className }: SkeletonCardsProps) => (
  <div aria-busy="true" aria-label="Loading" className={cn('grid grid-cols-1 gap-5', columns, className)}>
    {Array.from({ length: count }, (_, index) => (
      <Surface key={index} className="space-y-3">
        <Skeleton className="h-4 w-24 bg-slate-200" />
        <Skeleton className="h-8 w-14 bg-slate-200" />
        <Skeleton className="h-3 w-32 bg-slate-200" />
      </Surface>
    ))}
  </div>
);

interface ProgressBarProps {
  /** 0–100 */
  value: number;
  label: string;
  /** Show the percentage next to the bar */
  showValue?: boolean;
  className?: string;
}

/** Thin progress bar; turns green when complete. */
export const ProgressBar = ({ value, label, showValue = false, className }: ProgressBarProps) => {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={clamped}
        className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100"
      >
        <div
          className={cn('h-full rounded-full transition-[width] duration-300', clamped === 100 ? 'bg-emerald-500' : 'bg-primary')}
          style={{ width: `${clamped}%` }}
        />
      </div>
      {showValue && <span className="w-9 text-right text-xs font-medium tabular-nums text-slate-600">{clamped}%</span>}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Data display
// ---------------------------------------------------------------------------

type TagProps = ComponentProps<'span'> & TagVariants;

/** Small label for roles, states and categories. */
export const Tag = ({ tone, size, className, ...props }: TagProps) => (
  <span className={cn(tagVariants({ tone, size }), className)} {...props} />
);

type IconTileProps = IconTileVariants & { children: ReactNode; className?: string };

/** Icon inside a tinted square. Decorative: give the icon `aria-hidden`. */
export const IconTile = ({ tone, size, children, className }: IconTileProps) => (
  <div aria-hidden className={cn(iconTileVariants({ tone, size }), className)}>{children}</div>
);

interface UserAvatarProps {
  name: string;
  src?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const AVATAR_SIZES = { sm: 'size-7 text-[11px]', md: 'size-9 text-xs', lg: 'size-12 text-sm' };

/** Profile picture with initials fallback (shadcn Avatar). */
export const UserAvatar = ({ name, src, size = 'md', className }: UserAvatarProps) => (
  <Avatar className={cn(AVATAR_SIZES[size], className)}>
    {src && <AvatarImage src={src} alt="" />}
    {/* Inherit the font size set on the avatar (the primitive hard-codes text-sm) */}
    <AvatarFallback className="bg-primary/10 font-semibold text-primary text-[length:inherit] leading-none">{getInitials(name)}</AvatarFallback>
  </Avatar>
);

interface StatCardProps {
  title: string;
  value: ReactNode;
  subtitle?: ReactNode;
  icon: ReactNode;
  /** Text color class of the icon, e.g. "text-blue-600" */
  colorClass?: string;
  className?: string;
}

/** Key number with label: used in dashboard rows. */
export const StatCard = ({ title, value, subtitle, icon, colorClass = 'text-primary', className }: StatCardProps) => (
  <Surface interactive className={cn('flex flex-col gap-3 sm:gap-4', className)}>
    <div className="flex items-center gap-2">
      <span aria-hidden className={cn('size-4 [&_svg]:size-4', colorClass)}>{icon}</span>
      <p className="text-sm font-semibold text-slate-700">{title}</p>
    </div>
    <div>
      <p className="text-2xl font-bold tracking-tight text-slate-900 tabular-nums sm:text-3xl">{value}</p>
      {subtitle && <p className="mt-1 text-xs text-slate-500">{subtitle}</p>}
    </div>
  </Surface>
);

// ---------------------------------------------------------------------------
// Forms
// ---------------------------------------------------------------------------

interface FieldProps {
  label: ReactNode;
  htmlFor: string;
  required?: boolean;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
  className?: string;
}

/**
 * Label + control + hint/error. Give the control `aria-invalid={!!error}` and
 * `aria-describedby={fieldMessageId(htmlFor)}` when it has a hint or error.
 */
export const Field = ({ label, htmlFor, required, hint, error, children, className }: FieldProps) => (
  <div className={cn('space-y-1.5', className)}>
    <label htmlFor={htmlFor} className="text-sm font-medium text-slate-700">
      {label} {required && <span className="text-red-500" aria-hidden>*</span>}
    </label>
    {children}
    {(error || hint) && (
      <p id={fieldMessageId(htmlFor)} className={cn('text-xs', error ? 'text-red-600' : 'text-slate-500')}>
        {error ?? hint}
      </p>
    )}
  </div>
);
