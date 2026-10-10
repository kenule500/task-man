import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getPageCount, getPageItems, getPageRange } from './paginationUtils';
import { paginationButtonVariants } from './variants';

interface PaginationProps {
  /** Current page, 1-based. Not needed in cursor mode. */
  page?: number;
  /** Total number of items across all pages. */
  total?: number;
  pageSize?: number;
  /** Shows the "Rows per page" select when given together with `pageSizeOptions`. */
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];
  onPageChange?: (page: number) => void;
  /**
   * Compact mode: summary plus Previous/Next only. Use it for cursor paging, where the page count is
   * unknown; then pass `hasPrevious`, `hasNext`, `onPrevious`, `onNext` and a `summary`.
   */
  compact?: boolean;
  hasPrevious?: boolean;
  hasNext?: boolean;
  onPrevious?: () => void;
  onNext?: () => void;
  /** Replaces the "x–y of z" text, e.g. "Showing entries 41–60". */
  summary?: ReactNode;
  /** Names the navigation landmark, e.g. "Audit log pages". */
  label?: string;
  /** Wording of the previous/next buttons (cursor lists read better as Newer/Older). */
  previousLabel?: string;
  nextLabel?: string;
  className?: string;
}

/**
 * Page navigation: numbered pages with ellipsis, Previous/Next, optional page size and an "x–y of z" summary.
 * The current page has `aria-current="page"`; the summary is a polite live region.
 */
export const Pagination = ({
  page = 1, total = 0, pageSize = 10, onPageSizeChange, pageSizeOptions, onPageChange, compact = false,
  hasPrevious, hasNext, onPrevious, onNext, summary, label = 'Pagination', previousLabel = 'Previous',
  nextLabel = 'Next', className,
}: PaginationProps) => {
  const pageCount = getPageCount(total, pageSize);
  const current = Math.min(Math.max(page, 1), pageCount);
  const { start, end } = getPageRange(current, pageSize, total);
  const canPrevious = hasPrevious ?? current > 1;
  const canNext = hasNext ?? current < pageCount;
  const goPrevious = () => (onPrevious ?? (() => onPageChange?.(current - 1)))();
  const goNext = () => (onNext ?? (() => onPageChange?.(current + 1)))();

  const text = summary ?? (
    <>
      <span className="font-medium text-text-strong">{start}–{end}</span> of <span className="font-medium text-text-strong">{total}</span>
    </>
  );

  return (
    <nav aria-label={label} className={cn('flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between', className)}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="text-sm tabular-nums text-text-body" aria-live="polite">{text}</p>
        {onPageSizeChange && pageSizeOptions && (
          <div className="flex items-center gap-2 text-sm text-text-body">
            <span id={`${label}-page-size`}>Rows per page</span>
            <Select value={String(pageSize)} onValueChange={value => value && onPageSizeChange(Number(value))}>
              <SelectTrigger aria-labelledby={`${label}-page-size`} className="h-9 w-20 bg-white md:h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {pageSizeOptions.map(option => <SelectItem key={option} value={String(option)}>{option}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <ul className="flex items-center gap-1">
        <li className={compact ? 'flex-1 sm:flex-none' : undefined}>
          <button
            type="button"
            disabled={!canPrevious}
            onClick={goPrevious}
            className={cn(paginationButtonVariants({ current: false }), 'border border-border px-3', compact && 'w-full')}
          >
            <ChevronLeft aria-hidden className="size-4" />
            <span className={cn(!compact && 'max-sm:sr-only')}>{previousLabel}</span>
          </button>
        </li>
        {!compact && getPageItems(current, pageCount).map(item => (
          typeof item === 'number' ? (
            <li key={item}>
              <button
                type="button"
                aria-label={`Page ${item}`}
                aria-current={item === current ? 'page' : undefined}
                onClick={() => item !== current && onPageChange?.(item)}
                className={paginationButtonVariants({ current: item === current })}
              >
                {item}
              </button>
            </li>
          ) : (
            <li key={item} aria-hidden className="flex size-9 items-center justify-center text-text-subtle">…</li>
          )
        ))}
        <li className={compact ? 'flex-1 sm:flex-none' : undefined}>
          <button
            type="button"
            disabled={!canNext}
            onClick={goNext}
            className={cn(paginationButtonVariants({ current: false }), 'border border-border px-3', compact && 'w-full')}
          >
            <span className={cn(!compact && 'max-sm:sr-only')}>{nextLabel}</span>
            <ChevronRight aria-hidden className="size-4" />
          </button>
        </li>
      </ul>
    </nav>
  );
};
