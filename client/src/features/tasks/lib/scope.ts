import type { TaskFilters } from '../types';

/** Resolved sprint filter that matches no task (e.g. "active sprint" of a project without a running sprint). */
export const NO_SPRINT = 'none';

export interface ScopeSprint {
  _id: string;
  project: string;
  name: string;
  status: 'planned' | 'active' | 'completed';
  goal?: string;
  startDate?: string;
  endDate?: string;
}

export interface ScopeProject {
  _id: string;
  name: string;
  archived?: boolean;
  sprints: ScopeSprint[];
}

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

const isNamed = (project: string | undefined): project is string => Boolean(project) && project !== 'all';

/** The project a task filter names, if it is known. */
export const findScopeProject = (name: string | undefined, projects: readonly ScopeProject[]): ScopeProject | undefined =>
  isNamed(name) ? projects.find(project => sameName(project.name, name)) : undefined;

/**
 * The project the scope is about: the one named by `project`, or the owner of a sprint picked by id
 * (`?sprint=<id>` without `project`).
 */
export const scopeProjectOf = (filters: Pick<TaskFilters, 'project' | 'sprint'>, projects: readonly ScopeProject[]): ScopeProject | undefined => {
  if (isNamed(filters.project)) return findScopeProject(filters.project, projects);
  const sprint = filters.sprint;
  if (!sprint || sprint === 'all' || sprint === 'active' || sprint === 'backlog') return undefined;
  return projects.find(project => project.sprints.some(item => item._id === sprint));
};

/** The sprint the filter names (an id, or `active` inside the scope project), if it exists. */
export const scopeSprintOf = (filters: Pick<TaskFilters, 'project' | 'sprint'>, projects: readonly ScopeProject[]): ScopeSprint | undefined => {
  const sprint = filters.sprint;
  if (!sprint || sprint === 'all' || sprint === 'backlog') return undefined;
  const project = scopeProjectOf(filters, projects);
  if (sprint === 'active') return project?.sprints.find(item => item.status === 'active');
  return (project ? [project] : [...projects]).flatMap(item => item.sprints).find(item => item._id === sprint);
};

/**
 * Replaces `sprint=active` with the id of the running sprint of the project (or of every project when none is
 * named), `NO_SPRINT` when nothing is running. Other filters pass through untouched.
 */
export const resolveScopeFilters = (filters: TaskFilters, projects: readonly ScopeProject[]): TaskFilters => {
  if (filters.sprint !== 'active') return filters;
  const pool = isNamed(filters.project)
    ? [findScopeProject(filters.project, projects)].filter((item): item is ScopeProject => Boolean(item))
    : projects;
  const ids = pool.flatMap(project => project.sprints.filter(sprint => sprint.status === 'active').map(sprint => sprint._id));
  return { ...filters, sprint: ids.length > 0 ? ids.join(',') : NO_SPRINT };
};

/** True when a project or sprint narrows the tasks. */
export const hasScope = (filters: Pick<TaskFilters, 'project' | 'sprint'>): boolean =>
  (filters.project ?? 'all') !== 'all' || (filters.sprint ?? 'all') !== 'all';

/** Sprints in picker order: running first, then planned (by start date), completed last (most recent first). */
export const orderSprints = <T extends Pick<ScopeSprint, 'status' | 'startDate'>>(sprints: readonly T[]): T[] => {
  const rank = { active: 0, planned: 1, completed: 2 } as const;
  const start = (sprint: T) => sprint.startDate ?? '';
  return [...sprints].sort((a, b) =>
    rank[a.status] - rank[b.status]
    || (a.status === 'completed' ? start(b).localeCompare(start(a)) : start(a).localeCompare(start(b))));
};

/** `/:slug/tasks?...` for a project and sprint scope. */
export const scopeHref = (slug: string, scope: { view?: string; project?: string; sprint?: string }): string => {
  const params = new URLSearchParams();
  if (scope.view) params.set('view', scope.view);
  if (scope.project) params.set('project', scope.project);
  if (scope.sprint) params.set('sprint', scope.sprint);
  return `/${slug}/tasks?${params.toString()}`;
};
