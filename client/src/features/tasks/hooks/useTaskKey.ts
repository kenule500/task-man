// Deep import: the projects index imports the tasks module back
import { useProjectDirectory } from '@/features/projects/context/ProjectsContext';
import { resolveTaskKey } from '../lib/taskKey';
import type { Task } from '../types';

/** Key of `task` ("WEB-12") using the workspace's project directory; empty when the task has no number. */
export const useTaskKey = (task: Pick<Task, 'number' | 'project'>): string => {
  const { byName } = useProjectDirectory();
  return resolveTaskKey(task, byName);
};
