import { cn } from '@/lib/utils';
import type { SelectOption } from '../constants';

interface FilterPillsProps<T extends string> {
  value: T;
  options: (SelectOption<T> & { count?: number })[];
  onChange: (value: T) => void;
  'aria-label': string;
  className?: string;
}

/** Single-choice pill group (radio semantics) for quick filters, with optional counts. */
function FilterPills<T extends string>({ value, options, onChange, className, ...rest }: FilterPillsProps<T>) {
  return (
    <div role="radiogroup" aria-label={rest['aria-label']} className={cn(
        // Mobile: one scrollable row that bleeds to the card edges; from sm: wrapping pills
        '-mx-4 flex snap-x items-center gap-1.5 overflow-x-auto px-4 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        'sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:py-0',
        className,
      )}>
      {options.map(option => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={cn(
              'inline-flex h-10 shrink-0 snap-start items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors sm:h-8',
              'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary',
              active
                ? 'border-primary bg-primary text-white shadow-sm'
                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900',
            )}
          >
            {option.dot && <span aria-hidden className={cn('size-1.5 rounded-full', active ? 'bg-white' : option.dot)} />}
            {option.label}
            {option.count !== undefined && (
              <span className={cn('rounded px-1 tabular-nums', active ? 'bg-white/20' : 'bg-slate-100 text-slate-500')}>
                {option.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default FilterPills;
