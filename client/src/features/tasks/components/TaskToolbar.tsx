import { ArrowUpDown, Filter, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { SORT_OPTIONS, STATUS_OPTIONS, type SelectOption } from '../constants';
import type { TaskFilters, TaskSort, TaskStatus } from '../types';
import { OptionSelect } from './TaskSelects';

const STATUS_FILTER_OPTIONS: SelectOption<TaskStatus | 'all'>[] = [
  { value: 'all', label: 'All Status' },
  ...STATUS_OPTIONS,
];

interface TaskToolbarProps {
  filters: TaskFilters;
  onChange: (filters: TaskFilters) => void;
  /** Sorting only makes sense for the list; other views order tasks themselves. */
  showSort?: boolean;
  disabled?: boolean;
}

const TaskToolbar = ({ filters, onChange, showSort = true, disabled }: TaskToolbarProps) => (
  <div className="flex flex-wrap items-center gap-3">
    <div className="relative w-full sm:w-64">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" aria-hidden />
      <Input
        type="search"
        aria-label="Search tasks"
        placeholder="Search tasks..."
        className="pl-9 h-9 bg-white border-slate-200 rounded-lg text-sm"
        value={filters.search}
        onChange={e => onChange({ ...filters, search: e.target.value })}
        disabled={disabled}
      />
    </div>
    <OptionSelect
      aria-label="Filter by status"
      icon={<Filter className="size-3.5 text-slate-400" aria-hidden />}
      value={filters.status}
      options={STATUS_FILTER_OPTIONS}
      onChange={status => onChange({ ...filters, status })}
      disabled={disabled}
      className="w-auto min-w-36"
    />
    {showSort && (
      <OptionSelect<TaskSort>
        aria-label="Sort tasks"
        icon={<ArrowUpDown className="size-3.5 text-slate-400" aria-hidden />}
        value={filters.sort}
        options={SORT_OPTIONS}
        onChange={sort => onChange({ ...filters, sort })}
        disabled={disabled}
        className="w-auto min-w-36"
      />
    )}
  </div>
);

export default TaskToolbar;
