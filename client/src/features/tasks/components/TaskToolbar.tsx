import { ArrowUpDown, Flag, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
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
}

/** Search, status pills, priority and sort controls shared by every view. */
const TaskToolbar = ({ filters, onChange, counts, showSort = true }: TaskToolbarProps) => (
  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
    <FilterPills
      aria-label="Filter by status"
      value={filters.status}
      options={STATUS_FILTER_OPTIONS.map(option => ({ ...option, count: counts[option.value] }))}
      onChange={status => onChange({ ...filters, status })}
    />

    <div className="flex flex-wrap items-center gap-2">
      <div className="relative w-full sm:w-56">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" aria-hidden />
        <Input
          type="search"
          aria-label="Search tasks"
          placeholder="Search tasks..."
          className="pl-9 h-9 bg-white border-slate-200 rounded-lg text-sm"
          value={filters.search}
          onChange={e => onChange({ ...filters, search: e.target.value })}
        />
      </div>
      <OptionSelect
        aria-label="Filter by priority"
        icon={<Flag className="size-3.5 text-slate-400" aria-hidden />}
        value={filters.priority}
        options={PRIORITY_FILTER_OPTIONS}
        onChange={priority => onChange({ ...filters, priority })}
        className="w-auto min-w-36"
      />
      {showSort && (
        <OptionSelect<TaskSort>
          aria-label="Sort tasks"
          icon={<ArrowUpDown className="size-3.5 text-slate-400" aria-hidden />}
          value={filters.sort}
          options={SORT_OPTIONS}
          onChange={sort => onChange({ ...filters, sort })}
          className="w-auto min-w-36"
        />
      )}
    </div>
  </div>
);

export default TaskToolbar;
