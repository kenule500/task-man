import type { Task } from '../types';

export interface SubtaskProgressCount {
  done: number;
  total: number;
}

const byCreation = (a: Task, b: Task) =>
  a.position - b.position || (a.createdAt ?? '').localeCompare(b.createdAt ?? '');

/** Subtasks of `parentId`, in the order they were added. */
export const getSubtasks = (tasks: Task[], parentId: string): Task[] =>
  tasks.filter(task => task.parent === parentId).sort(byCreation);

/** Subtasks keyed by parent id. */
export const indexSubtasks = (tasks: Task[]): Map<string, Task[]> => {
  const index = new Map<string, Task[]>();
  for (const task of tasks) {
    if (!task.parent) continue;
    const list = index.get(task.parent);
    if (list) list.push(task);
    else index.set(task.parent, [task]);
  }
  for (const list of index.values()) list.sort(byCreation);
  return index;
};

export const countSubtasks = (subtasks: Task[]): SubtaskProgressCount => ({
  done: subtasks.filter(task => task.status === 'completed').length,
  total: subtasks.length,
});

export interface ListEntry {
  task: Task;
  /** 1 for a subtask rendered under its parent, 0 otherwise. */
  depth: 0 | 1;
  /** Set for a subtask shown without its parent (the parent is filtered out): rendered with a "Subtask of" chip. */
  orphanOf?: string;
}

/**
 * Orders tasks for the list: each subtask directly under its parent when the parent is shown too.
 * A subtask whose parent is not in `tasks` (filtered out) keeps its place and gets an `orphanOf` title.
 */
export const arrangeWithSubtasks = (tasks: Task[], allTasks: Task[] = tasks): ListEntry[] => {
  const shown = new Set(tasks.map(task => task._id));
  const children = indexSubtasks(tasks.filter(task => task.parent && shown.has(task.parent)));
  const titles = new Map(allTasks.map(task => [task._id, task.title]));
  const entries: ListEntry[] = [];

  for (const task of tasks) {
    if (task.parent && shown.has(task.parent)) continue;
    entries.push(task.parent ? { task, depth: 0, orphanOf: titles.get(task.parent) ?? 'another task' } : { task, depth: 0 });
    for (const child of children.get(task._id) ?? []) entries.push({ task: child, depth: 1 });
  }
  return entries;
};
