import { useId, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n';
import { ArrowUpDown, Download, Flag, FolderKanban, Layers, ListFilter, Rocket, Search, SlidersHorizontal, Tag, Timer, UserCheck, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { Project } from '@/features/projects/types';
import type { CustomField } from '@/features/fields/types';
import { canAddCustomFilter, filterOptions, filterableFields, withCustomFilter } from '@/features/fields/lib/fieldFilters';
import type { Release } from '@/features/releases/types';
import { PRIORITY_OPTIONS, SORT_OPTIONS, STATUS_OPTIONS, TASK_TYPE_OPTIONS, type SelectOption } from '../constants';
import { findScopeProject, orderSprints, scopeProjectOf } from '../lib/scope';
import type { Task, TaskFilters, TaskPriority, TaskSort, TaskStatus, TaskType } from '../types';
import FilterPills from './FilterPills';
import { OptionSelect } from './TaskSelects';

const STATUS_FILTER_OPTIONS: SelectOption<TaskStatus | 'all'>[] = [{ value: 'all', get label() { return i18n.t('tasks:toolbar.all'); } }, ...STATUS_OPTIONS];

const PRIORITY_FILTER_OPTIONS: SelectOption<TaskPriority | 'all'>[] = [
  { value: 'all', get label() { return i18n.t('tasks:toolbar.allPriorities'); } },
  ...PRIORITY_OPTIONS,
];

const TYPE_FILTER_OPTIONS: SelectOption<TaskType | 'all'>[] = [{ value: 'all', get label() { return i18n.t('tasks:toolbar.allTypes'); } }, ...TASK_TYPE_OPTIONS];

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
  /** Workspace releases; the release picker shows when a single project is selected and it has some. */
  releases?: Release[];
  /** Active custom fields; select, multi-select, checkbox and person fields get a filter. */
  customFields?: CustomField[];
  /** Workspace members, for the options of person field filters. */
  members?: { _id: string; name: string }[];
}

/** Search, status pills (not on the board), priority and sort controls shared by every view. */
const TaskToolbar = ({ filters, onChange, counts, showStatus = true, showSort = true, labels = [], epics = [], canFilterMine = false, projects = [], onExport, exportCount, viewsMenu, releases = [], customFields = [], members = [] }: TaskToolbarProps) => {
  const { t } = useTranslation('tasks');
  const epicOptions: SelectOption<string>[] = [
    { value: 'all', label: t('toolbar.allEpics') },
    { value: 'none', label: t('form.noEpic') },
    ...epics.map(epic => ({ value: epic._id, label: epic.title })),
  ];
  const labelOptions: SelectOption<string>[] = [
    { value: 'all', label: t('toolbar.allLabels') },
    ...labels.map(label => ({ value: label, label })),
  ];
  // Project picker: active projects (plus the chosen one, even when archived or unknown)
  const chosenProject = filters.project ?? 'all';
  const scopeProject = scopeProjectOf(filters, projects);
  const projectOptions: SelectOption<string>[] = [
    { value: 'all', label: t('toolbar.allProjects') },
    ...projects.filter(project => !project.archived || project === findScopeProject(chosenProject, projects))
      .map(project => ({ value: project.name, label: project.name })),
    ...(chosenProject !== 'all' && !findScopeProject(chosenProject, projects) ? [{ value: chosenProject, label: chosenProject }] : []),
  ];
  // Sprint picker: the scope project's sprints, running first, completed last
  const chosenSprint = filters.sprint ?? 'all';
  const sprintOptions: SelectOption<string>[] = scopeProject ? [
    { value: 'all', label: t('toolbar.allSprints') },
    ...(scopeProject.sprints.some(sprint => sprint.status === 'active') ? [{ value: 'active', label: t('toolbar.activeSprint') }] : []),
    { value: 'backlog', label: t('form.backlog') },
    ...orderSprints(scopeProject.sprints).map(sprint => ({
      value: sprint._id,
      label: sprint.status === 'completed' ? t('form.sprintCompleted', { name: sprint.name }) : sprint.status === 'planned' ? t('toolbar.sprintPlanned', { name: sprint.name }) : sprint.name,
    })),
    ...(chosenSprint !== 'all' && chosenSprint !== 'active' && chosenSprint !== 'backlog' && !scopeProject.sprints.some(sprint => sprint._id === chosenSprint)
      ? [{ value: chosenSprint, label: t('toolbar.unknownSprint') }] : []),
  ] : [];
  // Release picker: the scope project's releases (archived ones only when chosen)
  const chosenRelease = filters.release ?? 'all';
  const projectReleases = scopeProject
    ? releases.filter(release => release.project === scopeProject._id && (release.status !== 'archived' || release._id === chosenRelease))
    : [];
  const releaseOptions: SelectOption<string>[] = scopeProject && projectReleases.length > 0 ? [
    { value: 'all', label: t('toolbar.allReleases') },
    { value: 'none', label: t('toolbar.noRelease') },
    ...projectReleases.map(release => ({ value: release._id, label: release.status === 'released' ? t('toolbar.releaseReleased', { name: release.name }) : release.name })),
    ...(chosenRelease !== 'all' && chosenRelease !== 'none' && !projectReleases.some(release => release._id === chosenRelease)
      ? [{ value: chosenRelease, label: t('toolbar.unknownRelease') }] : []),
  ] : [];
  const fieldFilters = filterableFields(customFields, chosenProject);
  const assignedToMe = Boolean(filters.assignedToMe);
  // Phones show search + a "Filters" toggle; the other controls fold away until asked for
  const [showFilters, setShowFilters] = useState(false);
  const filtersId = useId();
  const activeFilterCount = [
    assignedToMe,
    chosenProject !== 'all',
    chosenSprint !== 'all',
    chosenRelease !== 'all',
    Object.keys(filters.custom ?? {}).length > 0,
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
          aria-label={t('toolbar.filterByStatus')}
          value={filters.status}
          options={STATUS_FILTER_OPTIONS.map(option => ({ ...option, count: counts[option.value] }))}
          onChange={status => onChange({ ...filters, status })}
        />
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="flex gap-2 sm:contents">
        <div className="relative min-w-0 flex-1 sm:w-56 sm:flex-none">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" aria-hidden />
          <Input
            type="search"
            aria-label={t('toolbar.searchLabel')}
            placeholder={t('toolbar.searchPlaceholder')}
            className="ps-9 h-11 bg-white border-slate-200 rounded-lg text-base sm:h-9 sm:text-sm"
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
          <SlidersHorizontal className="size-4" aria-hidden /> {t('toolbar.filters')}
          {activeFilterCount > 0 && (
            <span className="rounded-full bg-primary px-1.5 text-xs font-semibold tabular-nums text-white">
              {activeFilterCount}<span className="sr-only">{t('toolbar.activeSr')}</span>
            </span>
          )}
        </button>
        {viewsMenu && <div className="shrink-0 sm:order-last sm:ms-auto">{viewsMenu}</div>}
        {onExport && (
          <Button
            type="button"
            variant="outline"
            aria-label={t('toolbar.exportCsv')}
            title={exportCount === undefined ? t('toolbar.exportCsv') : t('toolbar.exportTitle', { count: exportCount })}
            disabled={exportCount === 0}
            onClick={onExport}
            className={cn('h-11 w-11 shrink-0 gap-1.5 border-slate-200 bg-white px-0 text-slate-700 sm:order-last sm:h-9 sm:w-auto sm:px-3', !viewsMenu && 'sm:ms-auto')}
          >
            <Download className="size-4" aria-hidden />
            <span className="hidden sm:inline">{t('toolbar.exportCsv')}</span>
          </Button>
        )}
        </div>
        <div id={filtersId} className={cn('grid grid-cols-2 gap-2 sm:contents', !showFilters && 'max-sm:hidden')}>
        {projects.length > 0 && (
          <OptionSelect
            aria-label={t('toolbar.filterByProject')}
            icon={<FolderKanban className="size-3.5 text-slate-500" aria-hidden />}
            value={chosenProject}
            options={projectOptions}
            // A sprint belongs to one project: changing the project clears it
            onChange={project => onChange({ ...filters, project, sprint: 'all', release: 'all' })}
            className="h-11 min-w-0 sm:h-9 sm:w-auto sm:min-w-36 sm:max-w-56"
          />
        )}
        {scopeProject && (
          <OptionSelect
            aria-label={t('toolbar.filterBySprint')}
            icon={<Timer className="size-3.5 text-slate-500" aria-hidden />}
            value={chosenSprint}
            options={sprintOptions}
            // Picking a sprint of a project found only by its sprint id also pins the project
            onChange={sprint => onChange({ ...filters, sprint, project: chosenProject === 'all' ? scopeProject.name : chosenProject })}
            className="h-11 min-w-0 sm:h-9 sm:w-auto sm:min-w-36 sm:max-w-56"
          />
        )}
        {releaseOptions.length > 0 && (
          <OptionSelect
            aria-label={t('toolbar.filterByRelease')}
            icon={<Rocket className="size-3.5 text-slate-500" aria-hidden />}
            value={chosenRelease}
            options={releaseOptions}
            onChange={release => onChange({ ...filters, release })}
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
            <UserCheck className="size-3.5" aria-hidden /> {t('toolbar.assignedToMe')}
          </button>
        )}
        {labels.length > 0 && (
          <OptionSelect
            aria-label={t('toolbar.filterByLabel')}
            icon={<Tag className="size-3.5 text-slate-500" aria-hidden />}
            value={filters.label ?? 'all'}
            options={labelOptions}
            onChange={label => onChange({ ...filters, label })}
            className="h-11 min-w-0 sm:h-9 sm:w-auto sm:min-w-36"
          />
        )}
        <OptionSelect
          aria-label={t('toolbar.filterByType')}
          icon={<Layers className="size-3.5 text-slate-500" aria-hidden />}
          value={filters.type ?? 'all'}
          options={TYPE_FILTER_OPTIONS}
          onChange={type => onChange({ ...filters, type })}
          className="h-11 min-w-0 sm:h-9 sm:w-auto sm:min-w-36"
        />
        {epics.length > 0 && (
          <OptionSelect
            aria-label={t('toolbar.filterByEpic')}
            icon={<Zap className="size-3.5 text-slate-500" aria-hidden />}
            value={filters.epic ?? 'all'}
            options={epicOptions}
            onChange={epic => onChange({ ...filters, epic })}
            className="h-11 min-w-0 sm:h-9 sm:w-auto sm:min-w-36"
          />
        )}
        {fieldFilters.map(field => (
          <OptionSelect
            key={field.key}
            aria-label={t('toolbar.filterByField', { name: field.name })}
            icon={<ListFilter className="size-3.5 text-slate-500" aria-hidden />}
            value={filters.custom?.[field.key] ?? 'all'}
            options={filterOptions(field, members, filters.custom?.[field.key])}
            disabled={!canAddCustomFilter(filters.custom, field.key)}
            onChange={value => onChange({ ...filters, custom: withCustomFilter(filters.custom, field.key, value) })}
            className="h-11 min-w-0 sm:h-9 sm:w-auto sm:min-w-36 sm:max-w-56"
          />
        ))}
        <OptionSelect
          aria-label={t('toolbar.filterByPriority')}
          icon={<Flag className="size-3.5 text-slate-500" aria-hidden />}
          value={filters.priority}
          options={PRIORITY_FILTER_OPTIONS}
          onChange={priority => onChange({ ...filters, priority })}
          className={cn('h-11 min-w-0 sm:h-9 sm:w-auto sm:min-w-36', !showSort && 'col-span-2')}
        />
        {showSort && (
          <OptionSelect<TaskSort>
            aria-label={t('toolbar.sort')}
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
