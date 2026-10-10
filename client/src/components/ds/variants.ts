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
        primary: 'bg-info-bg text-info-fg border-info-border',
        success: 'bg-success-bg text-success-fg border-success-border',
        warning: 'bg-warning-bg text-warning-fg border-warning-border',
        danger: 'bg-danger-bg text-danger-fg border-danger-border',
        dark: 'bg-inverse text-inverse-text border-inverse',
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
      info: 'bg-info-bg border-info-border text-info-fg',
      success: 'bg-success-bg border-success-border text-success-fg',
      warning: 'bg-warning-bg border-warning-border text-warning-fg',
      error: 'bg-danger-bg border-danger-border text-danger-fg',
    },
  },
  defaultVariants: { tone: 'info' },
});

/** Tinted square holding an icon (section and stat headers). */
export const iconTileVariants = cva('flex shrink-0 items-center justify-center rounded-xl', {
  variants: {
    tone: {
      primary: 'bg-primary/10 text-primary-hover',
      neutral: 'bg-slate-100 text-slate-600',
      success: 'bg-success-bg text-success-fg',
      warning: 'bg-warning-bg text-warning-fg',
      danger: 'bg-danger-bg text-danger-fg',
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
        true: 'bg-white text-text-strong shadow-raised dark:bg-slate-200',
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

// ---------------------------------------------------------------------------
// Switch, popovers, banner, stepper, pagination, description list
// ---------------------------------------------------------------------------

/** On/off switch track. The `before` pseudo-element enlarges the touch target beyond the track. */
export const switchVariants = cva(
  'peer relative inline-flex shrink-0 cursor-pointer items-center rounded-full bg-slate-500 outline-none transition-colors duration-(--duration-fast) before:absolute before:content-[""] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus data-checked:bg-primary data-disabled:cursor-not-allowed data-disabled:opacity-60 motion-reduce:transition-none',
  {
    variants: {
      size: {
        sm: 'h-5 w-9 before:-inset-2.5',
        md: 'h-6 w-11 before:-inset-2',
      },
    },
    defaultVariants: { size: 'md' },
  },
);

/** Moving knob of a switch. */
export const switchThumbVariants = cva(
  'pointer-events-none block rounded-full bg-white shadow-sm transition-transform duration-(--duration-fast) ease-standard motion-reduce:transition-none',
  {
    variants: {
      size: {
        sm: 'size-4 translate-x-0.5 data-checked:translate-x-[1.125rem]',
        md: 'size-5 translate-x-0.5 data-checked:translate-x-[1.375rem]',
      },
    },
    defaultVariants: { size: 'md' },
  },
);

/** Floating panel shared by Popover, HoverCard and Combobox. Width is a step, content decides the rest. */
export const floatingPanelVariants = cva(
  'z-50 max-w-(--available-width) origin-(--transform-origin) rounded-lg bg-popover text-popover-foreground shadow-floating ring-1 ring-foreground/10 outline-none duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95',
  {
    variants: {
      width: { auto: 'w-max', sm: 'w-56', md: 'w-72', lg: 'w-96' },
      padding: { none: '', sm: 'p-2', md: 'p-3.5' },
    },
    defaultVariants: { width: 'md', padding: 'md' },
  },
);

/** Page-level banner layout. The tone colors come from `alertVariants`, so both stay in step. */
export const bannerVariants = cva('flex w-full items-start gap-3 border-b px-4 py-2.5 text-sm sm:items-center', {
  variants: {
    sticky: { true: 'sticky top-0 z-(--z-sticky)', false: '' },
    rounded: { true: 'rounded-lg border', false: 'rounded-none border-x-0 border-t-0' },
  },
  defaultVariants: { sticky: false, rounded: true },
});

/** Numbered marker of a stepper step. */
export const stepperMarkerVariants = cva(
  'flex shrink-0 items-center justify-center rounded-full border-2 font-semibold tabular-nums transition-colors duration-(--duration-base) motion-reduce:transition-none',
  {
    variants: {
      state: {
        complete: 'border-primary bg-primary text-white',
        current: 'border-primary bg-white text-primary',
        upcoming: 'border-slate-300 bg-white text-slate-500',
      },
      size: { sm: 'size-6 text-xs', md: 'size-8 text-sm' },
    },
    defaultVariants: { state: 'upcoming', size: 'md' },
  },
);

/** Page button of a pagination bar. */
export const paginationButtonVariants = cva(
  'inline-flex min-w-9 items-center justify-center gap-1 rounded-md px-2 text-sm font-medium tabular-nums outline-none transition-colors duration-(--duration-fast) focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      current: {
        true: 'bg-primary text-white',
        false: 'text-text-body hover:bg-slate-100',
      },
      size: { sm: 'h-9 md:h-8', md: 'h-10 md:h-9' },
    },
    defaultVariants: { current: false, size: 'md' },
  },
);

/** Term/description grid of the DescriptionList. */
export const descriptionListVariants = cva('text-sm', {
  variants: {
    layout: {
      stacked: 'grid gap-x-6 gap-y-4',
      inline: 'grid grid-cols-[minmax(6rem,max-content)_1fr] gap-x-4 gap-y-3',
    },
    columns: { 1: '', 2: '', 3: '' },
  },
  compoundVariants: [
    { layout: 'stacked', columns: 2, class: 'sm:grid-cols-2' },
    { layout: 'stacked', columns: 3, class: 'grid-cols-2 sm:grid-cols-3' },
    { layout: 'inline', columns: 2, class: 'sm:grid-cols-[repeat(2,minmax(6rem,max-content)_1fr)]' },
  ],
  defaultVariants: { layout: 'stacked', columns: 1 },
});

export type SwitchVariants = VariantProps<typeof switchVariants>;
export type FloatingPanelVariants = VariantProps<typeof floatingPanelVariants>;
export type BannerVariants = VariantProps<typeof bannerVariants>;
export type StepperMarkerVariants = VariantProps<typeof stepperMarkerVariants>;
export type PaginationButtonVariants = VariantProps<typeof paginationButtonVariants>;
export type DescriptionListVariants = VariantProps<typeof descriptionListVariants>;
