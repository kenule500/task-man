import { ArrowUpDown, Flag, Search, Tag, UserCheck } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { PRIORITY_OPTIONS, SORT_OPTIONS, STATUS_OPTIONS, type SelectOption } from '../constants';
import type { TaskFilters, TaskPriority, TaskSort, TaskStatus } from '../types';
import FilterPills from './FilterPills';
import { OptionSelect } from './TaskSelects';

const STATUS_FILTER_OPTIONS: SelectOption<TaskStatus | 'all'>[] = [{ value: 'all', label: 'All' }, ...STATUS_OPTIONS];

const PRIORITY_FILTER_OPTIONS: SelectOption<TaskPriority | 'all'>[] = [
  { value: 'all', label: 'All priorities' },
  ...PRIORITY_OPTIONS,
];

interface TaskToolbarProps {
  filters: TaskFilters;
  onChange: (filters: TaskFilters) => void;
  /** Task count per status, shown inside the status pills. */
  counts: Record<TaskStatus | 'all', number>;
  /** Sorting only makes sense for the list; other views order tasks themselves. */
  showSort?: boolean;
  /** Labels used in the workspace; the label filter is hidden when there are none. */
  labels?: string[];
  /** Shows the "Assigned to me" toggle (needs a signed-in user to compare with). */
  canFilterMine?: boolean;
}

/** Search, status pills, priority and sort controls shared by every view. */
const TaskToolbar = ({ filters, onChange, counts, showSort = true, labels = [], canFilterMine = false }: TaskToolbarProps) => {
  const labelOptions: SelectOption<string>[] = [
    { value: 'all', label: 'All labels' },
    ...labels.map(label => ({ value: label, label })),
  ];
  const assignedToMe = Boolean(filters.assignedToMe);

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <FilterPills
        className="min-w-0"
        aria-label="Filter by status"
        value={filters.status}
        options={STATUS_FILTER_OPTIONS.map(option => ({ ...option, count: counts[option.value] }))}
        onChange={status => onChange({ ...filters, status })}
      />

      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
        <div className="relative col-span-2 sm:w-56">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" aria-hidden />
          <Input
            type="search"
            aria-label="Search tasks"
            placeholder="Search tasks..."
            className="pl-9 h-10 bg-white border-slate-200 rounded-lg text-base sm:h-9 sm:text-sm"
            value={filters.search}
            onChange={e => onChange({ ...filters, search: e.target.value })}
          />
        </div>
        {canFilterMine && (
          <button
            type="button"
            aria-pressed={assignedToMe}
            onClick={() => onChange({ ...filters, assignedToMe: !assignedToMe })}
            className={cn(
              'inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-primary sm:h-9',
              assignedToMe ? 'border-primary bg-primary text-white' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
            )}
          >
            <UserCheck className="size-3.5" aria-hidden /> Assigned to me
          </button>
        )}
        {labels.length > 0 && (
          <OptionSelect
            aria-label="Filter by label"
            icon={<Tag className="size-3.5 text-slate-400" aria-hidden />}
            value={filters.label ?? 'all'}
            options={labelOptions}
            onChange={label => onChange({ ...filters, label })}
            className="h-10 min-w-0 sm:h-9 sm:w-auto sm:min-w-36"
          />
        )}
        <OptionSelect
          aria-label="Filter by priority"
          icon={<Flag className="size-3.5 text-slate-400" aria-hidden />}
          value={filters.priority}
          options={PRIORITY_FILTER_OPTIONS}
          onChange={priority => onChange({ ...filters, priority })}
          className={cn('h-10 min-w-0 sm:h-9 sm:w-auto sm:min-w-36', !showSort && 'col-span-2')}
        />
        {showSort && (
          <OptionSelect<TaskSort>
            aria-label="Sort tasks"
            icon={<ArrowUpDown className="size-3.5 text-slate-400" aria-hidden />}
            value={filters.sort}
            options={SORT_OPTIONS}
            onChange={sort => onChange({ ...filters, sort })}
            className="h-10 min-w-0 sm:h-9 sm:w-auto sm:min-w-36"
          />
        )}
      </div>
    </div>
  );
};

export default TaskToolbar;
