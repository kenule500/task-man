import { useId, useState, type ReactNode } from 'react';
import { ArrowUpDown, Download, Flag, FolderKanban, Layers, Search, SlidersHorizontal, Tag, Timer, UserCheck, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { Project } from '@/features/projects/types';
import { PRIORITY_OPTIONS, SORT_OPTIONS, STATUS_OPTIONS, TASK_TYPE_OPTIONS, type SelectOption } from '../constants';
import { findScopeProject, orderSprints, scopeProjectOf } from '../lib/scope';
import type { Task, TaskFilters, TaskPriority, TaskSort, TaskStatus, TaskType } from '../types';
import FilterPills from './FilterPills';
import { OptionSelect } from './TaskSelects';

const STATUS_FILTER_OPTIONS: SelectOption<TaskStatus | 'all'>[] = [{ value: 'all', label: 'All' }, ...STATUS_OPTIONS];

const PRIORITY_FILTER_OPTIONS: SelectOption<TaskPriority | 'all'>[] = [
  { value: 'all', label: 'All priorities' },
  ...PRIORITY_OPTIONS,
];

const TYPE_FILTER_OPTIONS: SelectOption<TaskType | 'all'>[] = [{ value: 'all', label: 'All types' }, ...TASK_TYPE_OPTIONS];

interface TaskToolbarProps {
  filters: TaskFilters;
  onChange: (filters: TaskFilters) => void;
  /** Task count per status, shown inside the status pills. */
  counts: Record<TaskStatus | 'all', number>;
  /** Hides the status pills; the board's columns already are the statuses. Defaults to true. */
  showStatus?: boolean;
  /** Sorting only makes sense for the list; other views order tasks themselves. */
  showSort?: boolean;
  /** Labels used in the workspace; the label filter is hidden when there are none. */
  labels?: string[];
  /** Epics of the workspace; the epic filter is hidden when there are none. */
  epics?: Task[];
  /** Shows the "Assigned to me" toggle (needs a signed-in user to compare with). */
  canFilterMine?: boolean;
  /** Shows the "Export CSV" button; called when it is pressed. */
  onExport?: () => void;
  /** Tasks the export would contain; the button is disabled at 0. */
  exportCount?: number;
  /** Workspace projects with their sprints; the project and sprint pickers are hidden when there are none. */
  projects?: Project[];
  /** Slot for the saved-views menu, placed beside the export button. */
  viewsMenu?: ReactNode;
}

/** Search, status pills (not on the board), priority and sort controls shared by every view. */
const TaskToolbar = ({ filters, onChange, counts, showStatus = true, showSort = true, labels = [], epics = [], canFilterMine = false, projects = [], onExport, exportCount, viewsMenu }: TaskToolbarProps) => {
  const epicOptions: SelectOption<string>[] = [
    { value: 'all', label: 'All epics' },
    { value: 'none', label: 'No epic' },
    ...epics.map(epic => ({ value: epic._id, label: epic.title })),
  ];
  const labelOptions: SelectOption<string>[] = [
    { value: 'all', label: 'All labels' },
    ...labels.map(label => ({ value: label, label })),
  ];
  // Project picker: active projects (plus the chosen one, even when archived or unknown)
  const chosenProject = filters.project ?? 'all';
  const scopeProject = scopeProjectOf(filters, projects);
  const projectOptions: SelectOption<string>[] = [
    { value: 'all', label: 'All projects' },
    ...projects.filter(project => !project.archived || project === findScopeProject(chosenProject, projects))
      .map(project => ({ value: project.name, label: project.name })),
    ...(chosenProject !== 'all' && !findScopeProject(chosenProject, projects) ? [{ value: chosenProject, label: chosenProject }] : []),
  ];
  // Sprint picker: the scope project's sprints, running first, completed last
  const chosenSprint = filters.sprint ?? 'all';
  const sprintOptions: SelectOption<string>[] = scopeProject ? [
    { value: 'all', label: 'All sprints' },
    ...(scopeProject.sprints.some(sprint => sprint.status === 'active') ? [{ value: 'active', label: 'Active sprint' }] : []),
    { value: 'backlog', label: 'Backlog' },
    ...orderSprints(scopeProject.sprints).map(sprint => ({
      value: sprint._id,
      label: sprint.status === 'completed' ? `${sprint.name} (completed)` : sprint.status === 'planned' ? `${sprint.name} (planned)` : sprint.name,
    })),
    ...(chosenSprint !== 'all' && chosenSprint !== 'active' && chosenSprint !== 'backlog' && !scopeProject.sprints.some(sprint => sprint._id === chosenSprint)
      ? [{ value: chosenSprint, label: 'Unknown sprint' }] : []),
  ] : [];
  const assignedToMe = Boolean(filters.assignedToMe);
  // Phones show search + a "Filters" toggle; the other controls fold away until asked for
  const [showFilters, setShowFilters] = useState(false);
  const filtersId = useId();
  const activeFilterCount = [
    assignedToMe,
    chosenProject !== 'all',
    chosenSprint !== 'all',
    (filters.label ?? 'all') !== 'all',
    (filters.type ?? 'all') !== 'all',
    (filters.epic ?? 'all') !== 'all',
    filters.priority !== 'all',
  ].filter(Boolean).length;

  return (
    // Status pills on their own row; search and filters on the next one (no awkward wrapping)
    <div className="flex flex-col gap-3">
      {showStatus && (
        <FilterPills
          className="min-w-0"
          aria-label="Filter by status"
          value={filters.status}
          options={STATUS_FILTER_OPTIONS.map(option => ({ ...option, count: counts[option.value] }))}
          onChange={status => onChange({ ...filters, status })}
        />
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="flex gap-2 sm:contents">
        <div className="relative min-w-0 flex-1 sm:w-56 sm:flex-none">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" aria-hidden />
          <Input
            type="search"
            aria-label="Search tasks"
            placeholder="Search tasks..."
            className="pl-9 h-11 bg-white border-slate-200 rounded-lg text-base sm:h-9 sm:text-sm"
            value={filters.search}
            onChange={e => onChange({ ...filters, search: e.target.value })}
          />
        </div>
        <button
          type="button"
          aria-expanded={showFilters}
          aria-controls={filtersId}
          onClick={() => setShowFilters(open => !open)}
          className={cn(
            'inline-flex h-11 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-primary sm:hidden',
            showFilters || activeFilterCount > 0 ? 'border-primary text-primary' : 'border-slate-200 bg-white text-slate-700',
          )}
        >
          <SlidersHorizontal className="size-4" aria-hidden /> Filters
          {activeFilterCount > 0 && (
            <span className="rounded-full bg-primary px-1.5 text-xs font-semibold tabular-nums text-white">
              {activeFilterCount}<span className="sr-only"> active</span>
            </span>
          )}
        </button>
        {viewsMenu && <div className="shrink-0 sm:order-last sm:ml-auto">{viewsMenu}</div>}
        {onExport && (
          <Button
            type="button"
            variant="outline"
            aria-label="Export CSV"
            title={exportCount === undefined ? 'Export CSV' : `Export ${exportCount} ${exportCount === 1 ? 'task' : 'tasks'} as CSV`}
            disabled={exportCount === 0}
            onClick={onExport}
            className={cn('h-11 w-11 shrink-0 gap-1.5 border-slate-200 bg-white px-0 text-slate-700 sm:order-last sm:h-9 sm:w-auto sm:px-3', !viewsMenu && 'sm:ml-auto')}
          >
            <Download className="size-4" aria-hidden />
            <span className="hidden sm:inline">Export CSV</span>
          </Button>
        )}
        </div>
        <div id={filtersId} className={cn('grid grid-cols-2 gap-2 sm:contents', !showFilters && 'max-sm:hidden')}>
        {projects.length > 0 && (
          <OptionSelect
            aria-label="Filter by project"
            icon={<FolderKanban className="size-3.5 text-slate-500" aria-hidden />}
            value={chosenProject}
            options={projectOptions}
            // A sprint belongs to one project: changing the project clears it
            onChange={project => onChange({ ...filters, project, sprint: 'all' })}
            className="h-11 min-w-0 sm:h-9 sm:w-auto sm:min-w-36 sm:max-w-56"
          />
        )}
        {scopeProject && (
          <OptionSelect
            aria-label="Filter by sprint"
            icon={<Timer className="size-3.5 text-slate-500" aria-hidden />}
            value={chosenSprint}
            options={sprintOptions}
            // Picking a sprint of a project found only by its sprint id also pins the project
            onChange={sprint => onChange({ ...filters, sprint, project: chosenProject === 'all' ? scopeProject.name : chosenProject })}
            className="h-11 min-w-0 sm:h-9 sm:w-auto sm:min-w-36 sm:max-w-56"
          />
        )}
        {canFilterMine && (
          <button
            type="button"
            aria-pressed={assignedToMe}
            onClick={() => onChange({ ...filters, assignedToMe: !assignedToMe })}
            className={cn(
              'inline-flex h-11 items-center justify-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-primary sm:h-9',
              assignedToMe ? 'border-primary bg-primary text-white' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
            )}
          >
            <UserCheck className="size-3.5" aria-hidden /> Assigned to me
          </button>
        )}
        {labels.length > 0 && (
          <OptionSelect
            aria-label="Filter by label"
            icon={<Tag className="size-3.5 text-slate-500" aria-hidden />}
            value={filters.label ?? 'all'}
            options={labelOptions}
            onChange={label => onChange({ ...filters, label })}
            className="h-11 min-w-0 sm:h-9 sm:w-auto sm:min-w-36"
          />
        )}
        <OptionSelect
          aria-label="Filter by type"
          icon={<Layers className="size-3.5 text-slate-500" aria-hidden />}
          value={filters.type ?? 'all'}
          options={TYPE_FILTER_OPTIONS}
          onChange={type => onChange({ ...filters, type })}
          className="h-11 min-w-0 sm:h-9 sm:w-auto sm:min-w-36"
        />
        {epics.length > 0 && (
          <OptionSelect
            aria-label="Filter by epic"
            icon={<Zap className="size-3.5 text-slate-500" aria-hidden />}
            value={filters.epic ?? 'all'}
            options={epicOptions}
            onChange={epic => onChange({ ...filters, epic })}
            className="h-11 min-w-0 sm:h-9 sm:w-auto sm:min-w-36"
          />
        )}
        <OptionSelect
          aria-label="Filter by priority"
          icon={<Flag className="size-3.5 text-slate-500" aria-hidden />}
          value={filters.priority}
          options={PRIORITY_FILTER_OPTIONS}
          onChange={priority => onChange({ ...filters, priority })}
          className={cn('h-11 min-w-0 sm:h-9 sm:w-auto sm:min-w-36', !showSort && 'col-span-2')}
        />
        {showSort && (
          <OptionSelect<TaskSort>
            aria-label="Sort tasks"
            icon={<ArrowUpDown className="size-3.5 text-slate-500" aria-hidden />}
            value={filters.sort}
            options={SORT_OPTIONS}
            onChange={sort => onChange({ ...filters, sort })}
            className="h-11 min-w-0 sm:h-9 sm:w-auto sm:min-w-36"
          />
        )}
        </div>
      </div>
    </div>
  );
};

export default TaskToolbar;
