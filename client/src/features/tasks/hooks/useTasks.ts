import { useCallback, useEffect, useRef, useState } from 'react';
import { getApiErrorMessage, getApiErrorStatus, tasksApi } from '../api';
import type { Task, TaskInput, TaskPatch } from '../types';

/** Applies a patch locally the way the server will store it. */
const applyPatch = (task: Task, patch: TaskPatch): Task => ({ ...task, ...patch } as Task);

/**
 * Loads a workspace's tasks and exposes optimistic mutations.
 * Every view (list, board, calendar, timeline) shares this single source of truth.
 */
export const useTasks = (workspaceSlug: string | undefined) => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [error, setError] = useState('');
  // Workspace whose tasks are currently loaded; loading until it matches the URL
  const [loadedSlug, setLoadedSlug] = useState<string | null>(null);
  const loading = Boolean(workspaceSlug) && loadedSlug !== workspaceSlug;

  // Latest committed tasks, read by mutations to build rollbacks
  const tasksRef = useRef(tasks);
  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  useEffect(() => {
    if (!workspaceSlug) return;
    let cancelled = false;

    tasksApi.list(workspaceSlug)
      .then(list => {
        if (cancelled) return;
        setTasks(list);
        setError('');
      })
      .catch(err => {
        if (cancelled) return;
        const status = getApiErrorStatus(err);
        setTasks([]);
        setError(status === 403 || status === 404
          ? `You don't have access to "${workspaceSlug}". Use the workspace switcher to pick another one.`
          : getApiErrorMessage(err, 'Failed to load tasks.'));
      })
      .finally(() => {
        if (!cancelled) setLoadedSlug(workspaceSlug);
      });

    // Ignore responses of a workspace the user already left
    return () => {
      cancelled = true;
    };
  }, [workspaceSlug]);

  /** Creates a task; throws so forms can show the server's validation message. */
  const createTask = useCallback(async (input: TaskInput): Promise<Task | null> => {
    if (!workspaceSlug) return null;
    const created = await tasksApi.create(workspaceSlug, input);
    setTasks(current => [...current, created]);
    return created;
  }, [workspaceSlug]);

  /**
   * Optimistic update: the UI changes immediately and rolls back on failure.
   * Resolves to the saved task, or `null` when the change was rejected.
   */
  const updateTask = useCallback(async (id: string, patch: TaskPatch): Promise<Task | null> => {
    const previous = tasksRef.current.find(task => task._id === id);
    if (!workspaceSlug || !previous) return null;

    setTasks(current => current.map(task => (task._id === id ? applyPatch(task, patch) : task)));
    try {
      const saved = await tasksApi.update(workspaceSlug, id, patch);
      setTasks(current => current.map(task => (task._id === id ? saved : task)));
      return saved;
    } catch (err) {
      setTasks(current => current.map(task => (task._id === id ? previous : task)));
      setError(getApiErrorMessage(err, 'Could not save your change.'));
      return null;
    }
  }, [workspaceSlug]);

  /** Optimistic delete. Resolves to `false` when the server refused it. */
  const deleteTask = useCallback(async (id: string): Promise<boolean> => {
    if (!workspaceSlug) return false;
    const snapshot = tasksRef.current;

    // The server also detaches the task from dependants; mirror that locally.
    setTasks(current => current
      .filter(task => task._id !== id)
      .map(task => (task.dependencies?.includes(id)
        ? { ...task, dependencies: task.dependencies.filter(dep => dep !== id) }
        : task)));
    try {
      await tasksApi.remove(workspaceSlug, id);
      return true;
    } catch (err) {
      setTasks(snapshot);
      setError(getApiErrorMessage(err, 'Could not delete the task.'));
      return false;
    }
  }, [workspaceSlug]);

  const clearError = useCallback(() => setError(''), []);

  return {
    tasks,
    loading,
    error,
    clearError,
    createTask,
    updateTask,
    deleteTask,
  };
};
