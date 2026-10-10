import type { Task } from '@/features/tasks';
import type { Project, Sprint } from '../types';

/** A task belongs to a project when its `project` name matches the project's name, ignoring case. */
export const belongsToProject = (task: Task, project: Pick<Project, 'name'>): boolean =>
  (task.project ?? '').trim().toLowerCase() === project.name.trim().toLowerCase();

export const projectTasks = (tasks: Task[], project: Pick<Project, 'name'>): Task[] =>
  tasks.filter(task => belongsToProject(task, project));

const byPosition = (a: Task, b: Task) => a.position - b.position;

export interface ProjectTaskGroups {
  /** Top-level tasks per sprint id (every sprint of the project has an entry). */
  bySprint: Map<string, Task[]>;
  /** Top-level tasks with no sprint, or left open in a completed sprint. */
  backlog: Task[];
  /** Subtasks per parent task id. */
  subtasks: Map<string, Task[]>;
}

/** Splits a project's tasks into sprint lists, the backlog and subtasks (one level deep). */
export const groupProjectTasks = (tasks: Task[], sprints: Sprint[]): ProjectTaskGroups => {
  const sprintsById = new Map(sprints.map(sprint => [sprint._id, sprint]));
  const bySprint = new Map<string, Task[]>(sprints.map(sprint => [sprint._id, []]));
  const subtasks = new Map<string, Task[]>();
  const backlog: Task[] = [];

  for (const task of tasks) {
    // Epics are containers: they live on the Epics tab, not in sprints or the backlog
    if (task.type === 'epic') continue;
    if (task.parent) {
      subtasks.set(task.parent, [...(subtasks.get(task.parent) ?? []), task]);
      continue;
    }
    const sprint = task.sprint ? sprintsById.get(task.sprint) : undefined;
    // Completed sprints keep their finished tasks; anything still open is backlog
    if (!sprint || (sprint.status === 'completed' && task.status !== 'completed')) {
      backlog.push(task);
    } else {
      bySprint.get(sprint._id)?.push(task);
    }
  }

  for (const list of bySprint.values()) list.sort(byPosition);
  for (const list of subtasks.values()) list.sort(byPosition);
  backlog.sort(byPosition);
  return { bySprint, backlog, subtasks };
};

export interface SubtaskProgress {
  done: number;
  total: number;
}

export const subtaskProgress = (subtasks: Task[] | undefined): SubtaskProgress => ({
  done: (subtasks ?? []).filter(task => task.status === 'completed').length,
  total: (subtasks ?? []).length,
});
