import type { ComponentProps, ReactNode } from 'react';
import { Surface } from '@/components/ds';
import { cn } from '@/lib/utils';

interface ChartCardProps {
  id: string;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}

/** White card with a heading, an optional one-line explanation and a header action. */
export const ChartCard = ({ id, title, description, action, className, children }: ChartCardProps) => (
  <Surface as="section" aria-labelledby={id} padding="sm" className={cn('min-w-0 sm:p-5', className)}>
    <div className="mb-3 flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
      <div className="min-w-0">
        <h2 id={id} className="text-sm font-semibold text-slate-900">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-slate-600">{description}</p>}
      </div>
      {action}
    </div>
    {children}
  </Surface>
);

/** Floating readout pinned to the top of the chart at `left` percent of its width. Hidden from assistive tech: the live region says the same. */
export const ChartTooltip = ({ left, children }: { left: number; children: ReactNode }) => (
  <div
    aria-hidden
    className="pointer-events-none absolute top-1 z-(--z-tooltip) w-max max-w-56 -translate-x-1/2 rounded-lg bg-inverse px-2.5 py-1.5 text-xs leading-snug text-inverse-text shadow-floating"
    style={{ left: `${Math.min(84, Math.max(16, left))}%` }}
  >
    {children}
  </div>
);

interface LegendItem {
  label: string;
  swatch: ReactNode;
  value?: ReactNode;
}

/** Legend under a chart: a swatch plus the name, never color alone. */
export const ChartLegend = ({ items, className }: { items: LegendItem[]; className?: string }) => (
  <ul className={cn('mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-700', className)}>
    {items.map(item => (
      <li key={item.label} className="inline-flex items-center gap-1.5">
        {item.swatch}
        <span>{item.label}</span>
        {item.value !== undefined && <span className="tabular-nums text-slate-600">{item.value}</span>}
      </li>
    ))}
  </ul>
);

/** Frame for a chart: a keyboard-focusable, horizontally scrollable region so the page never overflows on phones. */
export const ScrollFrame = ({ label, className, ...props }: ComponentProps<'div'> & { label: string }) => (
  <div
    tabIndex={0}
    role="group"
    aria-label={label}
    className={cn(
      'overflow-x-auto rounded-lg focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary',
      className,
    )}
    {...props}
  />
);

