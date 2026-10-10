import type { Task, TaskStatus, TaskType } from '@/features/tasks';
import { dateKeyOf, toDateKey } from '@/features/tasks';
import type { Project, Sprint } from '../types';
import { projectTasks } from './grouping';
import { workProgress, type WorkProgress } from './sprintStats';

export interface ProjectStats {
  /** Top-level tasks (subtasks belong to their parent). */
  total: number;
  completed: number;
  /** 0-100 share of completed tasks. */
  progress: number;
  overdue: number;
  activeSprint?: Sprint;
  activeProgress?: WorkProgress;
}

export interface ProjectEntry {
  project: Project;
  summary: ProjectStats;
}

/** Counts and sprint progress of one project, from the workspace tasks. */
export const summarizeProject = (project: Project, tasks: Task[], today: Date = new Date()): ProjectStats => {
  const own = projectTasks(tasks, project).filter(task => !task.parent && task.type !== 'epic');
  const todayKey = toDateKey(today);
  const completed = own.filter(task => task.status === 'completed').length;
  const overdue = own.filter(task => task.status !== 'completed' && dateKeyOf(task.deadline) < todayKey).length;
  const activeSprint = project.sprints.find(sprint => sprint.status === 'active');

  return {
    total: own.length,
    completed,
    progress: own.length === 0 ? 0 : Math.round((completed / own.length) * 100),
    overdue,
    activeSprint,
    activeProgress: activeSprint ? workProgress(own.filter(task => task.sprint === activeSprint._id)) : undefined,
  };
};

export type ProjectSort = 'name' | 'recent' | 'progress';

export const PROJECT_SORT_OPTIONS: { value: ProjectSort; label: string }[] = [
  { value: 'name', label: 'Name' },
  { value: 'recent', label: 'Recently updated' },
  { value: 'progress', label: 'Progress' },
];

const stamp = (project: Project) => project.updatedAt ?? project.createdAt ?? '';

export const sortProjectEntries = (entries: ProjectEntry[], sort: ProjectSort): ProjectEntry[] =>
  [...entries].sort((a, b) => {
    if (sort === 'recent') return stamp(b.project).localeCompare(stamp(a.project)) || a.project.name.localeCompare(b.project.name);
    if (sort === 'progress') return b.summary.progress - a.summary.progress || a.project.name.localeCompare(b.project.name);
    return a.project.name.localeCompare(b.project.name);
  });

/** Matches the project's name, key or description. */
export const filterProjectEntries = (entries: ProjectEntry[], query: string): ProjectEntry[] => {
  const needle = query.trim().toLowerCase();
  if (!needle) return entries;
  return entries.filter(({ project }) =>
    [project.name, project.key, project.description ?? ''].some(value => value.toLowerCase().includes(needle)));
};

// ---------------------------------------------------------------------------
// Overview tab
// ---------------------------------------------------------------------------

export const countByStatus = (tasks: Task[]): Record<TaskStatus, number> => {
  const counts: Record<TaskStatus, number> = { pending: 0, 'in-progress': 0, completed: 0 };
  for (const task of tasks) if (!task.parent && task.type !== 'epic') counts[task.status] += 1;
  return counts;
};

/** Types shown in the overview chart; epics are containers and are counted on the Epics tab. */
export const TASK_TYPES: TaskType[] = ['story', 'task', 'bug', 'spike'];

export const countByType = (tasks: Task[]): Record<TaskType, number> => {
  const counts: Record<TaskType, number> = { story: 0, task: 0, bug: 0, spike: 0, epic: 0 };
  for (const task of tasks) if (!task.parent && task.type !== 'epic') counts[task.type ?? 'task'] += 1;
  return counts;
};

/** Open top-level tasks, earliest deadline first (overdue ones lead). */
export const upcomingDeadlines = (tasks: Task[], limit = 5): Task[] =>
  tasks
    .filter(task => !task.parent && task.status !== 'completed')
    .sort((a, b) => dateKeyOf(a.deadline).localeCompare(dateKeyOf(b.deadline)))
    .slice(0, limit);

/** Story points done and planned over the top-level tasks of a project. */
export const pointTotals = (tasks: Task[]): { done: number; total: number } => {
  const progress = workProgress(tasks);
  return { done: progress.donePoints, total: progress.totalPoints };
};
