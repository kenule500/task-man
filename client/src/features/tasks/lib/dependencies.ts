import type { Task } from '../types';

/**
 * Ids of every task that (directly or transitively) depends on `taskId`.
 * Those tasks cannot become prerequisites of `taskId` without creating a cycle.
 */
export const getDependentIds = (taskId: string, tasks: Task[]): Set<string> => {
  const dependants = new Map<string, string[]>();
  for (const task of tasks) {
    for (const dep of task.dependencies ?? []) {
      const list = dependants.get(dep);
      if (list) list.push(task._id);
      else dependants.set(dep, [task._id]);
    }
  }

  const result = new Set<string>();
  const stack = [...(dependants.get(taskId) ?? [])];
  while (stack.length > 0) {
    const id = stack.pop() as string;
    if (result.has(id)) continue;
    result.add(id);
    stack.push(...(dependants.get(id) ?? []));
  }
  return result;
};

/** Tasks that may be selected as prerequisites of `taskId` (all tasks when creating). */
export const getDependencyCandidates = (tasks: Task[], taskId?: string): Task[] => {
  if (!taskId) return tasks;
  const blocked = getDependentIds(taskId, tasks);
  return tasks.filter(task => task._id !== taskId && !blocked.has(task._id));
};
