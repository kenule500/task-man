import { cva, type VariantProps } from 'class-variance-authority';

// Shared visual variants of the TaskMan design system. Kept apart from the
// components so they can be reused by other primitives (and by fast refresh).

/** White elevated card: the base surface of every page section. */
export const surfaceVariants = cva('bg-white border border-slate-100 shadow-sm', {
  variants: {
    radius: { lg: 'rounded-xl', xl: 'rounded-2xl' },
    padding: { none: '', sm: 'p-4', md: 'p-5', lg: 'p-6 md:p-8' },
    interactive: { true: 'transition-shadow hover:shadow-md', false: '' },
  },
  defaultVariants: { radius: 'xl', padding: 'md', interactive: false },
});

/** Small rounded label. Tones map to the meaning colors in DESIGN.md. */
export const tagVariants = cva(
  'inline-flex items-center gap-1.5 rounded-md border font-medium whitespace-nowrap',
  {
    variants: {
      tone: {
        neutral: 'bg-slate-100 text-slate-700 border-slate-200',
        primary: 'bg-blue-50 text-blue-700 border-blue-100',
        success: 'bg-emerald-50 text-emerald-700 border-emerald-100',
        warning: 'bg-amber-50 text-amber-700 border-amber-100',
        danger: 'bg-red-50 text-red-700 border-red-100',
        dark: 'bg-slate-900 text-white border-slate-900',
      },
      size: { sm: 'px-1.5 py-0.5 text-[11px]', md: 'px-2.5 py-1 text-xs' },
    },
    defaultVariants: { tone: 'neutral', size: 'md' },
  },
);

/** Inline feedback message. */
export const alertVariants = cva('flex items-start gap-2.5 rounded-lg border p-3 text-sm', {
  variants: {
    tone: {
      info: 'bg-blue-50 border-blue-100 text-blue-700',
      success: 'bg-emerald-50 border-emerald-100 text-emerald-700',
      warning: 'bg-amber-50 border-amber-100 text-amber-800',
      error: 'bg-red-50 border-red-100 text-red-600',
    },
  },
  defaultVariants: { tone: 'info' },
});

/** Tinted square holding an icon (section and stat headers). */
export const iconTileVariants = cva('flex shrink-0 items-center justify-center rounded-xl', {
  variants: {
    tone: {
      primary: 'bg-primary/10 text-primary',
      neutral: 'bg-slate-100 text-slate-600',
      success: 'bg-emerald-50 text-emerald-600',
      warning: 'bg-amber-50 text-amber-600',
      danger: 'bg-red-50 text-red-600',
    },
    size: { sm: 'size-8 [&_svg]:size-4', md: 'size-10 [&_svg]:size-5', lg: 'size-14 [&_svg]:size-7' },
  },
  defaultVariants: { tone: 'primary', size: 'md' },
});

/** Work-flow status pill built on the status tokens (index.css). */
export const statusPillVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full border border-transparent font-medium whitespace-nowrap',
  {
    variants: {
      status: {
        pending: 'bg-status-pending-bg text-status-pending-fg',
        'in-progress': 'bg-status-in-progress-bg text-status-in-progress-fg',
        completed: 'bg-status-completed-bg text-status-completed-fg',
      },
      size: { sm: 'px-2 py-0.5 text-[11px]', md: 'px-2.5 py-1 text-xs' },
    },
    defaultVariants: { status: 'pending', size: 'md' },
  },
);

/** Dot color of a status pill. */
export const statusDotVariants = cva('size-1.5 shrink-0 rounded-full', {
  variants: {
    status: {
      pending: 'bg-status-pending',
      'in-progress': 'bg-status-in-progress',
      completed: 'bg-status-completed',
    },
  },
  defaultVariants: { status: 'pending' },
});

/** Scrum work item type chip built on the type tokens. */
export const typeBadgeVariants = cva(
  'inline-flex items-center gap-1 rounded-md font-medium whitespace-nowrap',
  {
    variants: {
      type: {
        story: 'bg-type-story-bg text-type-story',
        task: 'bg-type-task-bg text-type-task',
        bug: 'bg-type-bug-bg text-type-bug',
        spike: 'bg-type-spike-bg text-type-spike',
      },
      size: { sm: 'px-1.5 py-0.5 text-[11px] [&_svg]:size-3', md: 'px-2 py-1 text-xs [&_svg]:size-3.5' },
    },
    defaultVariants: { type: 'task', size: 'md' },
  },
);

/** Keyboard key cap. */
export const kbdVariants = cva(
  'inline-flex items-center justify-center rounded-md border border-border-strong bg-surface-sunken font-mono font-medium text-text-body shadow-[0_1px_0_0_var(--color-border-strong)]',
  {
    variants: {
      size: { sm: 'h-5 min-w-5 px-1 text-[10px]', md: 'h-6 min-w-6 px-1.5 text-xs' },
    },
    defaultVariants: { size: 'md' },
  },
);

/** Item of a segmented control (the sliding highlight is the selected state). */
export const segmentedItemVariants = cva(
  'inline-flex items-center justify-center gap-1.5 rounded-md font-medium whitespace-nowrap outline-none transition-colors duration-(--duration-fast) focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      selected: {
        true: 'bg-white text-text-strong shadow-raised',
        false: 'text-text-subtle hover:text-text-strong',
      },
      size: { sm: 'h-7 px-2.5 text-xs', md: 'h-8 px-3 text-sm' },
    },
    defaultVariants: { selected: false, size: 'md' },
  },
);

export type StatusPillVariants = VariantProps<typeof statusPillVariants>;
export type TypeBadgeVariants = VariantProps<typeof typeBadgeVariants>;
export type KbdVariants = VariantProps<typeof kbdVariants>;
export type SegmentedItemVariants = VariantProps<typeof segmentedItemVariants>;
export type SurfaceVariants = VariantProps<typeof surfaceVariants>;
export type TagVariants = VariantProps<typeof tagVariants>;
export type AlertVariants = VariantProps<typeof alertVariants>;
export type IconTileVariants = VariantProps<typeof iconTileVariants>;

/** Two-letter initials for avatars ("Ada Lovelace" → "AL"). */
export const getInitials = (name: string): string => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const letters = parts.length === 1 ? parts[0].slice(0, 2) : parts[0][0] + parts[parts.length - 1][0];
  return letters.toUpperCase();
};

/** Id of a Field's hint/error message, for the control's `aria-describedby`. */
export const fieldMessageId = (fieldId: string): string => `${fieldId}-message`;
