import type { ComponentProps, ReactElement, ReactNode } from 'react';
import { AlertCircle, BookOpen, Bug, SquareCheck, Zap, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { UserAvatar } from './primitives';
import {
  statusDotVariants, statusPillVariants, typeBadgeVariants,
  type StatusPillVariants, type TypeBadgeVariants,
} from './variants';

// ---------------------------------------------------------------------------
// ProgressRing
// ---------------------------------------------------------------------------

interface ProgressRingProps {
  /** 0–100 */
  value: number;
  /** Accessible name, e.g. "Sprint 4 progress". */
  label: string;
  /** Diameter in px. */
  size?: number;
  strokeWidth?: number;
  /** Show the percentage in the middle. */
  showValue?: boolean;
  className?: string;
}

/** Circular progress; green at 100%. Exposed as a `progressbar` with its value. */
export const ProgressRing = ({ value, label, size = 48, strokeWidth = 5, showValue = true, className }: ProgressRingProps) => {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clamped}
      className={cn('relative inline-flex shrink-0 items-center justify-center', className)}
      style={{ width: size, height: size }}
    >
      <svg aria-hidden width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={strokeWidth} className="stroke-surface-sunken" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped / 100)}
          className={cn('transition-[stroke-dashoffset] duration-(--duration-slow) ease-standard', clamped === 100 ? 'stroke-status-completed' : 'stroke-primary')}
        />
      </svg>
      {showValue && <span aria-hidden className="absolute text-xs font-semibold tabular-nums text-text-strong">{clamped}%</span>}
    </div>
  );
};

// ---------------------------------------------------------------------------
// StatusPill and TypeBadge
// ---------------------------------------------------------------------------

const STATUS_LABELS = { pending: 'Pending', 'in-progress': 'In progress', completed: 'Completed' } as const;

type StatusPillProps = Omit<ComponentProps<'span'>, 'children'> & StatusPillVariants & {
  /** Overrides the default label ("In progress"). */
  children?: ReactNode;
};

/** Workflow status as dot + text, so color is never the only signal. */
export const StatusPill = ({ status = 'pending', size, className, children, ...props }: StatusPillProps) => (
  <span className={cn(statusPillVariants({ status, size }), className)} {...props}>
    <span aria-hidden className={statusDotVariants({ status })} />
    {children ?? STATUS_LABELS[status ?? 'pending']}
  </span>
);

const TYPE_META: Record<'story' | 'task' | 'bug' | 'spike', { label: string; icon: LucideIcon }> = {
  story: { label: 'Story', icon: BookOpen },
  task: { label: 'Task', icon: SquareCheck },
  bug: { label: 'Bug', icon: Bug },
  spike: { label: 'Spike', icon: Zap },
};

type TypeBadgeProps = Omit<ComponentProps<'span'>, 'children'> & TypeBadgeVariants;

/** Scrum work item type: icon + name in the type color. */
export const TypeBadge = ({ type = 'task', size, className, ...props }: TypeBadgeProps) => {
  const { label, icon: Icon } = TYPE_META[type ?? 'task'];
  return (
    <span className={cn(typeBadgeVariants({ type, size }), className)} {...props}>
      <Icon aria-hidden />
      {label}
    </span>
  );
};

// ---------------------------------------------------------------------------
// AvatarStack
// ---------------------------------------------------------------------------

interface AvatarStackProps {
  people: { name: string; src?: string }[];
  /** Avatars shown before the "+N" counter. */
  max?: number;
  size?: 'sm' | 'md';
  className?: string;
}

/** Overlapping avatars with a "+N" overflow; the group names everyone for screen readers. */
export const AvatarStack = ({ people, max = 4, size = 'sm', className }: AvatarStackProps) => {
  const shown = people.slice(0, max);
  const hidden = people.length - shown.length;
  return (
    <div
      role="group"
      aria-label={people.length === 0 ? 'No one assigned' : `Assigned to ${people.map(person => person.name).join(', ')}`}
      className={cn('flex items-center -space-x-2', className)}
    >
      {shown.map(person => (
        <UserAvatar key={person.name} name={person.name} src={person.src} size={size} className="ring-2 ring-white" />
      ))}
      {hidden > 0 && (
        <span
          aria-hidden
          className={cn(
            'flex items-center justify-center rounded-full bg-surface-sunken font-semibold tabular-nums text-text-body ring-2 ring-white',
            size === 'sm' ? 'size-7 text-[11px]' : 'size-9 text-xs',
          )}
        >
          +{hidden}
        </span>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Divider
// ---------------------------------------------------------------------------

interface DividerProps {
  /** Optional text centered on the line ("or"). */
  label?: string;
  className?: string;
}

/** Horizontal rule, optionally with a label. */
export const Divider = ({ label, className }: DividerProps) =>
  label ? (
    <div className={cn('flex items-center gap-3 text-xs font-medium text-text-subtle', className)}>
      <span aria-hidden className="h-px flex-1 bg-border" />
      {label}
      <span aria-hidden className="h-px flex-1 bg-border" />
    </div>
  ) : (
    <hr className={cn('border-0 border-t border-border', className)} />
  );

// ---------------------------------------------------------------------------
// ErrorState
// ---------------------------------------------------------------------------

interface ErrorStateProps {
  /** What happened. */
  title: string;
  /** Why it happened, in plain words. */
  reason?: string;
  /** What the person can do now. */
  nextStep?: string;
  /** Primary recovery action (a Button). */
  action?: ReactNode;
  className?: string;
}

/** A failed page or panel: what happened, why, and what to do. Announced as an alert. */
export const ErrorState = ({ title, reason, nextStep, action, className }: ErrorStateProps) => (
  <div role="alert" className={cn('px-4 py-14 text-center sm:py-16', className)}>
    <div aria-hidden className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-red-50 text-red-600">
      <AlertCircle className="size-7" />
    </div>
    <h3 className="mb-1 text-lg font-semibold text-text-strong">{title}</h3>
    {reason && <p className="mx-auto max-w-md text-sm text-text-subtle">{reason}</p>}
    {nextStep && <p className="mx-auto mt-1 max-w-md text-sm text-text-body">{nextStep}</p>}
    {action && <div className="mt-5 flex justify-center">{action}</div>}
  </div>
);

// ---------------------------------------------------------------------------
// Timeline and ActivityItem
// ---------------------------------------------------------------------------

/** Ordered list of activity entries, newest first by convention. */
export const Timeline = ({ className, ...props }: ComponentProps<'ol'>) => (
  <ol className={cn('relative space-y-5', className)} {...props} />
);

interface ActivityItemProps {
  /** Who did it. */
  actor: string;
  /** What they did ("moved this to Done"). */
  children: ReactNode;
  /** ISO timestamp for the `<time>` element. */
  timestamp?: string;
  /** Human text for the time ("2 hours ago"). */
  timeLabel?: string;
  icon?: ReactNode;
}

/** One entry of a Timeline: avatar or icon, "Actor action", and a time. */
export const ActivityItem = ({ actor, children, timestamp, timeLabel, icon }: ActivityItemProps) => (
  <li className="flex gap-3">
    <span aria-hidden className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-text-subtle [&_svg]:size-3.5">
      {icon ?? <UserAvatar name={actor} size="sm" />}
    </span>
    <div className="min-w-0 text-sm text-text-body">
      <p>
        <span className="font-semibold text-text-strong">{actor}</span> {children}
      </p>
      {(timestamp || timeLabel) && (
        <time dateTime={timestamp} className="text-xs text-text-subtle tabular-nums">{timeLabel ?? timestamp}</time>
      )}
    </div>
  </li>
);

// ---------------------------------------------------------------------------
// TooltipHint
// ---------------------------------------------------------------------------

interface TooltipHintProps {
  /** Short text; keep it under 6 words. Do not put essential information here. */
  label: ReactNode;
  /** A single focusable element (usually an icon Button). */
  children: ReactElement;
  side?: 'top' | 'bottom' | 'left' | 'right';
}

/** Tooltip around one focusable element; shows on hover and keyboard focus. */
export const TooltipHint = ({ label, children, side = 'top' }: TooltipHintProps) => (
  <Tooltip>
    <TooltipTrigger render={children} />
    <TooltipContent side={side}>{label}</TooltipContent>
  </Tooltip>
);
