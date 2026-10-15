import { useCallback } from 'react';
import { getCached, setCached, tasksKey } from '@/lib/queryCache';
import { useProjectDirectory } from '@/features/projects/context/ProjectsContext';
import { tasksApi, type RelationResult } from '../api';
import type { Task, TaskLinkType } from '../types';

/**
 * Actions that answer with a task (duplicate, move), two tasks (links) or a watcher list. They write the result into
 * the shared tasks cache, which every `useTasks` of the same workspace follows, so views refresh without being wired to the call.
 */
export const useTaskExtras = (workspaceSlug?: string) => {
  const directory = useProjectDirectory();
  const slug = workspaceSlug || directory.slug || '';

  /** Replaces tasks of the cached list by their fresh versions. */
  const replaceCached = useCallback((...fresh: Task[]) => {
    const key = tasksKey(slug);
    const cached = getCached<Task[]>(key);
    if (!cached) return;
    const byId = new Map(fresh.map(task => [task._id, task]));
    setCached(key, cached.map(item => byId.get(item._id) ?? item));
  }, [slug]);

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

  /** Links two tasks (both sides are updated in the cache). Throws on failure. */
  const addRelation = useCallback(async (task: Pick<Task, '_id'>, type: TaskLinkType, other: Pick<Task, '_id'>): Promise<RelationResult> => {
    const result = await tasksApi.addRelation(slug, task._id, type, other._id);
    replaceCached(result.task, result.related);
    return result;
  }, [slug, replaceCached]);

  /** Removes a link from both tasks. Throws on failure. */
  const removeRelation = useCallback(async (task: Pick<Task, '_id'>, type: TaskLinkType, other: Pick<Task, '_id'>): Promise<RelationResult> => {
    const result = await tasksApi.removeRelation(slug, task._id, other._id, type);
    replaceCached(result.task, result.related);
    return result;
  }, [slug, replaceCached]);

  /** Makes a task a subtask of `parent`, or promotes a subtask (`null`); resolves to the updated task. Throws on failure. */
  const moveTask = useCallback(async (task: Pick<Task, '_id'>, parent: string | null): Promise<Task> => {
    const moved = await tasksApi.moveTask(slug, task._id, parent);
    replaceCached(moved);
    return moved;
  }, [slug, replaceCached]);

  return { enabled: Boolean(slug), duplicateTask, setWatching, addRelation, removeRelation, moveTask };
};
