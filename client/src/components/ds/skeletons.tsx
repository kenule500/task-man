import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { Surface } from './primitives';

// Loading placeholders that mirror the shape of the content they stand in for, so the layout does not
// jump when data arrives. Each variant is one labelled live region: aria-busy plus visually hidden text.

const BAR = 'bg-slate-200 motion-reduce:animate-none';

interface RegionProps {
  /** Announced to screen readers, e.g. "Loading tasks". */
  label?: string;
  className?: string;
  children: ReactNode;
}

const SkeletonRegion = ({ label = 'Loading', className, children }: RegionProps) => (
  <div role="status" aria-busy="true" aria-label={label} className={className}>
    <span className="sr-only">{label}</span>
    <div aria-hidden>{children}</div>
  </div>
);

interface SkeletonListProps {
  rows?: number;
  /** Round avatar at the start of each row */
  avatar?: boolean;
  /** Trailing pill (status, count) */
  trailing?: boolean;
  /** Skip the card around the rows, e.g. when it already sits in a Surface */
  bare?: boolean;
  label?: string;
  className?: string;
}

/** Rows with avatar, title, meta line and an optional trailing pill. */
export const SkeletonList = ({ rows = 5, avatar = true, trailing = true, bare = false, label = 'Loading list', className }: SkeletonListProps) => {
  const list = (
    <ul className="divide-y divide-border-subtle">
      {Array.from({ length: rows }, (_, index) => (
        <li key={index} className="flex items-center gap-3 px-4 py-3">
          {avatar && <Skeleton className={cn('size-9 shrink-0 rounded-full', BAR)} />}
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className={cn('h-3.5 w-2/5 max-w-60', BAR)} />
            <Skeleton className={cn('h-3 w-3/5 max-w-80', BAR)} />
          </div>
          {trailing && <Skeleton className={cn('h-6 w-16 shrink-0 rounded-full', BAR)} />}
        </li>
      ))}
    </ul>
  );
  return (
    <SkeletonRegion label={label} className={className}>
      {bare ? list : <Surface padding="none" radius="lg" className="overflow-hidden">{list}</Surface>}
    </SkeletonRegion>
  );
};

interface SkeletonBoardProps {
  columns?: number;
  cards?: number;
  label?: string;
  className?: string;
}

/** Kanban columns: a header and a stack of cards each. Clips sideways like the real board. */
export const SkeletonBoard = ({ columns = 3, cards = 3, label = 'Loading board', className }: SkeletonBoardProps) => (
  <SkeletonRegion label={label} className={className}>
    <div className="flex gap-4 overflow-hidden">
      {Array.from({ length: columns }, (_, column) => (
        <div key={column} className="w-72 shrink-0 space-y-3 rounded-xl bg-slate-100 p-3 sm:flex-1">
          <div className="flex items-center justify-between">
            <Skeleton className={cn('h-4 w-24', BAR)} />
            <Skeleton className={cn('h-5 w-7 rounded-md', BAR)} />
          </div>
          {Array.from({ length: Math.max(1, cards - (column % 2)) }, (_, card) => (
            <Surface key={card} padding="sm" radius="lg" className="space-y-3">
              <Skeleton className={cn('h-3.5 w-4/5', BAR)} />
              <Skeleton className={cn('h-3 w-1/2', BAR)} />
              <div className="flex items-center justify-between pt-1">
                <Skeleton className={cn('h-5 w-14 rounded-md', BAR)} />
                <Skeleton className={cn('size-6 rounded-full', BAR)} />
              </div>
            </Surface>
          ))}
        </div>
      ))}
    </div>
  </SkeletonRegion>
);

interface SkeletonTableProps {
  rows?: number;
  columns?: number;
  label?: string;
  className?: string;
}

/** Table with a header row; the first column is wider like a title column. */
export const SkeletonTable = ({ rows = 6, columns = 4, label = 'Loading table', className }: SkeletonTableProps) => {
  const template = { gridTemplateColumns: `minmax(0,2fr) repeat(${Math.max(columns - 1, 1)}, minmax(0,1fr))` };
  return (
    <SkeletonRegion label={label} className={className}>
      <Surface padding="none" radius="lg" className="overflow-hidden">
        <div className="grid gap-4 border-b border-border-subtle bg-surface-sunken px-4 py-3" style={template}>
          {Array.from({ length: columns }, (_, column) => <Skeleton key={column} className={cn('h-3 w-16', BAR)} />)}
        </div>
        <div className="divide-y divide-border-subtle">
          {Array.from({ length: rows }, (_, row) => (
            <div key={row} className="grid items-center gap-4 px-4 py-3.5" style={template}>
              {Array.from({ length: columns }, (_, column) => (
                <Skeleton key={column} className={cn('h-3.5', column === 0 ? 'w-4/5' : 'w-2/3', BAR)} />
              ))}
            </div>
          ))}
        </div>
      </Surface>
    </SkeletonRegion>
  );
};

interface SkeletonChartProps {
  /** Height class of the plot area */
  height?: string;
  /** Title row above the plot */
  title?: boolean;
  bars?: number;
  /** Skip the card around the chart */
  bare?: boolean;
  label?: string;
  className?: string;
}

const BAR_HEIGHTS = ['45%', '70%', '55%', '85%', '35%', '65%', '90%', '50%', '75%', '60%'];

/** Chart card: title and a bar plot with a baseline. */
export const SkeletonChart = ({ height = 'h-56', title = true, bars = 8, bare = false, label = 'Loading chart', className }: SkeletonChartProps) => {
  const plot = (
    <div className="space-y-3">
      {title && <Skeleton className={cn('h-4 w-40', BAR)} />}
      <div className={cn('flex items-end gap-2 border-b border-l border-slate-200 px-2 pt-2', height)}>
        {Array.from({ length: bars }, (_, index) => (
          <Skeleton key={index} className={cn('flex-1 rounded-b-none', BAR)} style={{ height: BAR_HEIGHTS[index % BAR_HEIGHTS.length] }} />
        ))}
      </div>
    </div>
  );
  return (
    <SkeletonRegion label={label} className={className}>
      {bare ? plot : <Surface>{plot}</Surface>}
    </SkeletonRegion>
  );
};

interface SkeletonDetailProps {
  /** Detail rows in the key/value block */
  fields?: number;
  /** Paragraph lines of the description */
  lines?: number;
  label?: string;
  className?: string;
}

/** Body of a detail dialog: title, key/value block and a paragraph. */
export const SkeletonDetail = ({ fields = 4, lines = 3, label = 'Loading details', className }: SkeletonDetailProps) => (
  <SkeletonRegion label={label} className={className}>
    <div className="space-y-6">
      <div className="space-y-2.5">
        <Skeleton className={cn('h-5 w-3/5', BAR)} />
        <div className="flex gap-2">
          <Skeleton className={cn('h-6 w-20 rounded-full', BAR)} />
          <Skeleton className={cn('h-6 w-16 rounded-md', BAR)} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-4">
        {Array.from({ length: fields }, (_, index) => (
          <div key={index} className="space-y-1.5">
            <Skeleton className={cn('h-3 w-16', BAR)} />
            <Skeleton className={cn('h-4 w-28', BAR)} />
          </div>
        ))}
      </div>
      <div className="space-y-2">
        {Array.from({ length: lines }, (_, index) => (
          <Skeleton key={index} className={cn('h-3.5', index === lines - 1 ? 'w-2/3' : 'w-full', BAR)} />
        ))}
      </div>
    </div>
  </SkeletonRegion>
);
