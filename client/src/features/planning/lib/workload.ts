// Workload: story points and items per assignee for a sprint or a date range. Pure aggregation, no UI.
import { dateKeyOf, type Task, type TaskStatus, type TaskUser } from '@/features/tasks';
import type { Project, Sprint } from '@/features/projects';

export const UNASSIGNED_ID = 'unassigned';

export type WorkloadScope =
  | { kind: 'sprint'; sprintId: string }
  | { kind: 'range'; from: string; to: string; projectName?: string };

export type StatusTotals = Record<TaskStatus, number> & { total: number };

export interface WorkloadRow {
  /** User id, or `unassigned`. */
  id: string;
  name: string;
  avatarUrl?: string;
  /** Top-level work items in the scope, earliest deadline first. */
  tasks: Task[];
  items: StatusTotals;
  points: StatusTotals;
  /** Items without a story point estimate. */
  unestimated: number;
  /** Points of this person against `capacity`, as a whole percent (not capped). */
  usage: number;
  /** Points above capacity (0 when within it). */
  overBy: number;
  over: boolean;
}

export interface Workload {
  people: WorkloadRow[];
  unassigned: WorkloadRow;
  /** Distinct items in the scope (a task with two assignees counts once here). */
  itemCount: number;
  pointCount: number;
}

const nameKey = (value: string | undefined | null) => (value ?? '').trim().toLowerCase();
const pointsOf = (task: Task) => Math.max(0, task.storyPoints ?? 0);
const emptyTotals = (): StatusTotals => ({ pending: 0, 'in-progress': 0, completed: 0, total: 0 });

/** Top-level work items (not epics, not subtasks) that fall in the scope. */
export const tasksInScope = (tasks: Task[], scope: WorkloadScope): Task[] => {
  const workItems = tasks.filter(task => !task.parent && task.type !== 'epic');
  if (scope.kind === 'sprint') return workItems.filter(task => task.sprint === scope.sprintId);

  return workItems.filter(task => {
    if (scope.projectName && nameKey(task.project) !== nameKey(scope.projectName)) return false;
    const end = dateKeyOf(task.deadline);
    const start = task.startDate ? dateKeyOf(task.startDate) : end;
    return start <= scope.to && end >= scope.from;
  });
};

const buildRow = (id: string, user: Pick<TaskUser, 'name' | 'avatarUrl'>, tasks: Task[], capacity: number): WorkloadRow => {
  const items = emptyTotals();
  const points = emptyTotals();
  for (const task of tasks) {
    items[task.status] += 1;
    items.total += 1;
    points[task.status] += pointsOf(task);
    points.total += pointsOf(task);
  }
  const over = points.total > capacity;
  return {
    id,
    name: user.name,
    avatarUrl: user.avatarUrl,
    tasks: [...tasks].sort((a, b) => dateKeyOf(a.deadline).localeCompare(dateKeyOf(b.deadline)) || a.title.localeCompare(b.title)),
    items,
    points,
    unestimated: tasks.filter(task => task.storyPoints === null || task.storyPoints === undefined).length,
    usage: capacity > 0 ? Math.round((points.total / capacity) * 100) : 0,
    overBy: over ? points.total - capacity : 0,
    over,
  };
};

/**
 * Groups scoped tasks by assignee. A task with several assignees counts for each of them
 * (everyone is on the hook for it); people are ordered by points, busiest first.
 */
export const aggregateWorkload = (scoped: Task[], capacity: number): Workload => {
  const byPerson = new Map<string, { user: TaskUser; tasks: Task[] }>();
  const loose: Task[] = [];
  for (const task of scoped) {
    const assignees = task.assignees ?? [];
    if (assignees.length === 0) loose.push(task);
    for (const user of assignees) {
      const entry = byPerson.get(user._id) ?? { user, tasks: [] };
      entry.tasks.push(task);
      byPerson.set(user._id, entry);
    }
  }

  const people = [...byPerson.entries()]
    .map(([id, entry]) => buildRow(id, entry.user, entry.tasks, capacity))
    .sort((a, b) => b.points.total - a.points.total || b.items.total - a.items.total || a.name.localeCompare(b.name));

  return {
    people,
    unassigned: buildRow(UNASSIGNED_ID, { name: 'Unassigned' }, loose, capacity),
    itemCount: scoped.length,
    pointCount: scoped.reduce((sum, task) => sum + pointsOf(task), 0),
  };
};

/** The project whose sprint is running (first in list order), else the first project; undefined when none. */
export const defaultWorkloadProject = (projects: Project[]): Project | undefined => {
  const open = projects.filter(project => !project.archived);
  return open.find(project => project.sprints.some(sprint => sprint.status === 'active')) ?? open[0];
};

/** The sprint to show for a project: the active one, else the next planned, else the latest. */
export const defaultWorkloadSprint = (project: Project | undefined): Sprint | undefined => {
  if (!project) return undefined;
  const sprints = [...project.sprints].sort((a, b) => a.startDate.localeCompare(b.startDate));
  return sprints.find(sprint => sprint.status === 'active')
    ?? sprints.find(sprint => sprint.status === 'planned')
    ?? sprints.at(-1);
};

/** "13 of 10 points, 4 items, over capacity by 3": the text alternative of a capacity bar. */
export const describeLoad = (row: WorkloadRow, capacity: number): string => {
  const base = `${row.points.total} of ${capacity} points, ${row.items.total} ${row.items.total === 1 ? 'item' : 'items'}`;
  return row.over ? `${base}, over capacity by ${row.overBy}` : base;
};
