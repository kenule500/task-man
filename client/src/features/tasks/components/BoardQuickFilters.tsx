import { Rows3, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { QUICK_FILTER_KEYS, QUICK_FILTER_LABELS, toggleQuickFilter, type QuickFilterKey } from '../lib/boardQuickFilters';
import { SWIMLANE_GROUPS, SWIMLANE_LABELS, type SwimlaneGroup } from '../lib/swimlanes';
import { OptionSelect } from './TaskSelects';

interface BoardQuickFiltersProps {
  active: QuickFilterKey[];
  onChange: (keys: QuickFilterKey[]) => void;
  /** "My tasks" needs a signed-in user to compare with; hidden without one. */
  canFilterMine: boolean;
  groupBy: SwimlaneGroup;
  onGroupByChange: (group: SwimlaneGroup) => void;
  className?: string;
}

const GROUP_OPTIONS = SWIMLANE_GROUPS.map(value => ({ value, label: SWIMLANE_LABELS[value] }));

/** Jira-style toggle chips above the board (AND-combined) and, from `md`, the swimlane grouping. */
const BoardQuickFilters = ({ active, onChange, canFilterMine, groupBy, onGroupByChange, className }: BoardQuickFiltersProps) => (
  <div className={cn('flex min-w-0 items-center gap-2', className)}>
    <div
      role="group"
      aria-label="Quick filters"
      className="-mx-1 flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto px-1 py-1 [scrollbar-width:none] md:flex-wrap md:overflow-visible [&::-webkit-scrollbar]:hidden"
    >
      {QUICK_FILTER_KEYS.filter(key => key !== 'mine' || canFilterMine).map(key => {
        const pressed = active.includes(key);
        return (
          <button
            key={key}
            type="button"
            aria-pressed={pressed}
            onClick={() => onChange(toggleQuickFilter(active, key))}
            className={cn(
              'inline-flex h-11 shrink-0 items-center rounded-full border px-3.5 text-xs font-medium transition-colors md:h-8 md:px-3',
              'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary',
              pressed
                ? 'border-primary bg-primary text-white shadow-sm'
                : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50',
            )}
          >
            {QUICK_FILTER_LABELS[key]}
          </button>
        );
      })}
      {active.length > 0 && (
        <button
          type="button"
          onClick={() => onChange([])}
          className="inline-flex h-11 shrink-0 items-center gap-1 rounded-full px-3 text-xs font-medium text-slate-600 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-primary md:h-8"
        >
          <X className="size-3.5" aria-hidden /> Clear<span className="sr-only"> quick filters</span>
        </button>
      )}
    </div>

    {/* Swimlanes only exist from md; phones show one column at a time */}
    <div className="hidden shrink-0 items-center gap-2 md:flex">
      <span className="text-xs font-medium text-slate-600" aria-hidden>Group by</span>
      <OptionSelect<SwimlaneGroup>
        aria-label="Group by"
        icon={<Rows3 className="size-3.5 text-slate-500" aria-hidden />}
        value={groupBy}
        options={GROUP_OPTIONS}
        onChange={onGroupByChange}
        className="h-8 w-auto min-w-36"
      />
    </div>
  </div>
);

export default BoardQuickFilters;
