import { useCallback } from 'react';
import { getCached, setCached, tasksKey } from '@/lib/queryCache';
import { useProjectDirectory } from '@/features/projects/context/ProjectsContext';
import { tasksApi } from '../api';
import type { Task } from '../types';

/**
 * Actions that answer with a task (duplicate) or a watcher list. They write the result into the shared tasks
 * cache, which every `useTasks` of the same workspace follows, so views refresh without being wired to the call.
 */
export const useTaskExtras = (workspaceSlug?: string) => {
  const directory = useProjectDirectory();
  const slug = workspaceSlug || directory.slug || '';

  /** Copies a task (and its direct subtasks when asked); resolves to the new task. Throws on failure. */
  const duplicateTask = useCallback(async (task: Pick<Task, '_id'>, includeSubtasks = false): Promise<Task> => {
    const { task: copy, subtasks } = await tasksApi.duplicate(slug, task._id, includeSubtasks);
    const key = tasksKey(slug);
    const cached = getCached<Task[]>(key);
    if (cached) setCached(key, [...cached, copy, ...subtasks]);
    return copy;
  }, [slug]);

  /** Follows or unfollows a task as the signed-in user; resolves to the watcher ids. Throws on failure. */
  const setWatching = useCallback(async (task: Pick<Task, '_id'>, watching: boolean): Promise<string[]> => {
    const watchers = await tasksApi.setWatching(slug, task._id, watching);
    const key = tasksKey(slug);
    const cached = getCached<Task[]>(key);
    if (cached) setCached(key, cached.map(item => (item._id === task._id ? { ...item, watchers } : item)));
    return watchers;
  }, [slug]);

  return { enabled: Boolean(slug), duplicateTask, setWatching };
};
