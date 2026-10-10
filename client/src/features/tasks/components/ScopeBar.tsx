import { Link } from 'react-router-dom';
import { CalendarDays, ChevronRight, FileBarChart, Flag, Inbox, X } from 'lucide-react';
import { Tag } from '@/components/ds';
import { cn } from '@/lib/utils';
// Deep imports: the projects index imports the tasks module back
import ProjectFolderIcon from '@/features/projects/components/ProjectFolderIcon';
import { describeDaysLeft, formatSprintRange, isSprintLate } from '@/features/projects/lib/sprintStats';
import type { Project } from '@/features/projects/types';
import { hasScope, scopeProjectOf, scopeSprintOf } from '../lib/scope';
import type { TaskFilters } from '../types';

interface ScopeBarProps {
  slug: string;
  /** Filters from the URL; only `project` and `sprint` are read. */
  filters: Pick<TaskFilters, 'project' | 'sprint'>;
  projects: Project[];
  /** Called by the clear button: drop the project and sprint scope. */
  onClear: () => void;
}

const STATUS_TAG = {
  planned: { tone: 'neutral', label: 'Planned' },
  active: { tone: 'primary', label: 'Active' },
  completed: { tone: 'success', label: 'Completed' },
} as const;

const linkClass = 'inline-flex min-h-11 min-w-0 items-center gap-1.5 rounded-md px-1 text-sm font-semibold text-slate-900 outline-none hover:underline focus-visible:outline-2 focus-visible:outline-primary md:min-h-8';

/**
 * Context bar above the task views while a project and/or sprint scopes them:
 * project (links to its page) › sprint with status, dates, goal and time left, a sprint report link and a clear button.
 */
const ScopeBar = ({ slug, filters, projects, onClear }: ScopeBarProps) => {
  if (!hasScope(filters)) return null;

  const project = scopeProjectOf(filters, projects);
  const sprint = scopeSprintOf(filters, projects);
  const projectName = project?.name ?? (filters.project && filters.project !== 'all' ? filters.project : undefined);
  const wantsSprint = (filters.sprint ?? 'all') !== 'all';
  const full = projects.find(item => item._id === project?._id);

  return (
    <section
      aria-label="Scope"
      data-testid="scope-bar"
      className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 shadow-sm"
    >
      <nav aria-label="Scope path" className="min-w-0 max-w-full">
        <ol className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
          {projectName && (
            <li className="flex min-w-0 items-center gap-1.5">
              {full ? (
                <Link to={`/${slug}/projects/${full._id}`} title={`Open project ${full.name}`} className={linkClass}>
                  <ProjectFolderIcon size="sm" color={full.color} icon={full.icon} />
                  <span className="truncate">{full.name}</span>
                </Link>
              ) : (
                <span className="inline-flex min-h-8 min-w-0 items-center gap-1.5 px-1 text-sm font-semibold text-slate-900">
                  <ProjectFolderIcon size="sm" color="slate" icon="folder" />
                  <span className="truncate">{projectName}</span>
                </span>
              )}
              {wantsSprint && <ChevronRight aria-hidden className="size-3.5 shrink-0 text-slate-400" />}
            </li>
          )}
          {wantsSprint && (
            <li className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
              {filters.sprint === 'backlog' ? (
                <span className="inline-flex min-h-8 items-center gap-1.5 text-sm font-semibold text-slate-900">
                  <Inbox aria-hidden className="size-4 text-slate-500" /> Backlog
                </span>
              ) : sprint ? (
                <>
                  <span aria-current="page" className="min-w-0 truncate text-sm font-semibold text-slate-900" title={sprint.name}>{sprint.name}</span>
                  <Tag tone={STATUS_TAG[sprint.status].tone} size="sm">{STATUS_TAG[sprint.status].label}</Tag>
                  {sprint.startDate && sprint.endDate && (
                    <span className="inline-flex items-center gap-1 text-xs tabular-nums text-slate-600">
                      <CalendarDays aria-hidden className="size-3.5" />
                      {formatSprintRange({ startDate: sprint.startDate, endDate: sprint.endDate })}
                    </span>
                  )}
                  {sprint.status === 'active' && sprint.endDate && (
                    <span className={cn('inline-flex items-center gap-1 text-xs tabular-nums text-slate-600', isSprintLate({ endDate: sprint.endDate, status: 'active' }) && 'font-semibold text-red-600')}>
                      <Flag aria-hidden className="size-3.5" />
                      {describeDaysLeft({ endDate: sprint.endDate })}
                    </span>
                  )}
                  {sprint.goal && (
                    <span className="max-w-full truncate text-xs text-slate-600 sm:max-w-md" title={sprint.goal}>
                      <span className="font-semibold">Goal:</span> {sprint.goal}
                    </span>
                  )}
                </>
              ) : (
                <span className="text-sm text-slate-600">
                  {filters.sprint === 'active' ? 'No sprint is running' : 'Sprint not found'}
                </span>
              )}
            </li>
          )}
        </ol>
      </nav>

      <div className="ml-auto flex shrink-0 items-center gap-1">
        {sprint && sprint.status !== 'planned' && (
          <Link
            to={`/${slug}/projects/${sprint.project}/sprints/${sprint._id}/report`}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-primary outline-none hover:underline focus-visible:outline-2 focus-visible:outline-primary md:min-h-8"
          >
            <FileBarChart aria-hidden className="size-3.5" />
            Sprint report<span className="sr-only"> for {sprint.name}</span>
          </Link>
        )}
        <button
          type="button"
          onClick={onClear}
          aria-label="Clear project and sprint scope"
          title="Clear scope"
          className="inline-flex size-11 items-center justify-center rounded-md text-slate-600 outline-none hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-primary md:size-8"
        >
          <X aria-hidden className="size-4" />
        </button>
      </div>
    </section>
  );
};

export default ScopeBar;
