import type { Task } from '../types';

/** Ids of tasks that were open in `previous` and are completed in `next` (new tasks do not count). */
export const newlyCompleted = (previous: readonly Task[], next: readonly Task[]): string[] => {
  const before = new Map(previous.map(task => [task._id, task.status]));
  return next
    .filter(task => task.status === 'completed' && before.has(task._id) && before.get(task._id) !== 'completed')
    .map(task => task._id);
};
