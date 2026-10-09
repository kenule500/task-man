import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getApiErrorMessage, getApiErrorStatus, isTaskPayload, tasksApi, type UploadOptions } from '../api';
import type { Task, TaskAttachment, TaskComment, TaskInput, TaskPatch, TaskUser } from '../types';

/** How long a deleted task can be restored before the delete request is sent. */
export const DELETE_UNDO_MS = 6000;

const UNKNOWN_USER = 'Member';

/** Applies a patch locally the way the server will store it (assignee ids become users). */
const applyPatch = (task: Task, patch: TaskPatch, directory: Map<string, TaskUser>): Task => {
  const { assignees, ...rest } = patch;
  const next = { ...task, ...rest } as Task;
  if (assignees) next.assignees = assignees.map(id => directory.get(id) ?? { _id: id, name: UNKNOWN_USER });
  return next;
};

/** Everyone we already know by id (assignees and comment authors across tasks). */
const buildDirectory = (tasks: Task[]): Map<string, TaskUser> => {
  const directory = new Map<string, TaskUser>();
  for (const task of tasks) {
    for (const user of task.assignees ?? []) directory.set(user._id, user);
    for (const comment of task.comments ?? []) {
      if (comment.author && typeof comment.author === 'object') directory.set(comment.author._id, comment.author);
    }
  }
  return directory;
};

/** The API may answer with just an author id; fall back to who we know. */
const withAuthor = (comment: TaskComment, fallback?: TaskUser): TaskComment => {
  const author = comment.author as TaskUser | string | undefined;
  if (author && typeof author === 'object') return comment;
  return { ...comment, author: fallback ?? { _id: String(author ?? ''), name: UNKNOWN_USER } };
};

const detachDependency = (task: Task, id: string): Task =>
  task.dependencies?.includes(id) ? { ...task, dependencies: task.dependencies.filter(dep => dep !== id) } : task;

interface PendingDelete {
  slug: string;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * Loads a workspace's tasks and exposes optimistic mutations.
 * Every view (list, board, calendar, timeline) shares this single source of truth.
 */
export const useTasks = (workspaceSlug: string | undefined) => {
  const [allTasks, setTasks] = useState<Task[]>([]);
  const [error, setError] = useState('');
  // Tasks hidden by a delete that can still be undone
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(() => new Set());
  // Workspace whose tasks are currently loaded; loading until it matches the URL
  const [loadedSlug, setLoadedSlug] = useState<string | null>(null);
  const loading = Boolean(workspaceSlug) && loadedSlug !== workspaceSlug;

  // Latest committed tasks, read by mutations to build rollbacks
  const tasksRef = useRef(allTasks);
  useEffect(() => {
    tasksRef.current = allTasks;
  }, [allTasks]);

  const pendingRef = useRef(new Map<string, PendingDelete>());

  /** Tasks the UI shows: pending deletes are hidden and no longer referenced as dependencies. */
  const tasks = useMemo(() => {
    if (pendingIds.size === 0) return allTasks;
    return allTasks
      .filter(task => !pendingIds.has(task._id))
      .map(task => (task.dependencies?.some(dep => pendingIds.has(dep))
        ? { ...task, dependencies: task.dependencies.filter(dep => !pendingIds.has(dep)) }
        : task));
  }, [allTasks, pendingIds]);

  /** Sends the delete request of a pending task now (timer expired, or the user leaves). */
  const commitDelete = useCallback(async (id: string) => {
    const entry = pendingRef.current.get(id);
    if (!entry) return;
    clearTimeout(entry.timer);
    pendingRef.current.delete(id);
    try {
      await tasksApi.remove(entry.slug, id);
      // The server also detaches the task from dependants; mirror that locally.
      setTasks(current => current.filter(task => task._id !== id).map(task => detachDependency(task, id)));
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not delete the task.'));
    } finally {
      // On failure the task reappears
      setPendingIds(current => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    }
  }, []);

  const flushDeletes = useCallback(
    async () => { await Promise.all([...pendingRef.current.keys()].map(commitDelete)); },
    [commitDelete],
  );

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

    // Ignore responses of a workspace the user already left, and don't lose its pending deletes
    return () => {
      cancelled = true;
      void flushDeletes();
    };
  }, [workspaceSlug, flushDeletes]);

  // Closing the tab must not silently drop a delete the user already saw as done
  useEffect(() => {
    const onPageHide = () => { void flushDeletes(); };
    window.addEventListener('pagehide', onPageHide);
    return () => window.removeEventListener('pagehide', onPageHide);
  }, [flushDeletes]);

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

    const directory = buildDirectory(tasksRef.current);
    setTasks(current => current.map(task => (task._id === id ? applyPatch(task, patch, directory) : task)));
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

  /**
   * Deletes with undo: the task disappears at once and the request is only sent after
   * `DELETE_UNDO_MS`, unless `undoDelete` is called first (or the page is left: then it is sent immediately).
   */
  const deleteTask = useCallback((id: string) => {
    if (!workspaceSlug || pendingRef.current.has(id)) return;
    const timer = setTimeout(() => { void commitDelete(id); }, DELETE_UNDO_MS);
    pendingRef.current.set(id, { slug: workspaceSlug, timer });
    setPendingIds(current => new Set(current).add(id));
  }, [workspaceSlug, commitDelete]);

  /** Restores a task deleted less than `DELETE_UNDO_MS` ago. */
  const undoDelete = useCallback((id: string) => {
    const entry = pendingRef.current.get(id);
    if (!entry) return;
    clearTimeout(entry.timer);
    pendingRef.current.delete(id);
    setPendingIds(current => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
  }, []);

  const replaceTask = useCallback((saved: Task) => {
    setTasks(current => current.map(task => (task._id === saved._id ? saved : task)));
  }, []);

  /** Adds a comment; throws so the caller can show the server's message. */
  const addComment = useCallback(async (id: string, text: string, author?: TaskUser): Promise<void> => {
    if (!workspaceSlug) return;
    const result = await tasksApi.addComment(workspaceSlug, id, text);
    if (isTaskPayload(result)) {
      replaceTask(result);
      return;
    }
    const comment = withAuthor(result, author);
    setTasks(current => current.map(task => (task._id === id ? { ...task, comments: [...(task.comments ?? []), comment] } : task)));
  }, [workspaceSlug, replaceTask]);

  const removeComment = useCallback(async (id: string, commentId: string): Promise<void> => {
    if (!workspaceSlug) return;
    const saved = await tasksApi.removeComment(workspaceSlug, id, commentId);
    if (saved) {
      replaceTask(saved);
      return;
    }
    setTasks(current => current.map(task => (task._id === id
      ? { ...task, comments: (task.comments ?? []).filter(comment => comment._id !== commentId) }
      : task)));
  }, [workspaceSlug, replaceTask]);

  const uploadAttachment = useCallback(async (id: string, file: File, options?: UploadOptions): Promise<void> => {
    if (!workspaceSlug) return;
    const result = await tasksApi.uploadAttachment(workspaceSlug, id, file, options);
    if (isTaskPayload(result)) {
      replaceTask(result);
      return;
    }
    const attachment: TaskAttachment = result;
    setTasks(current => current.map(task => (task._id === id
      ? { ...task, attachments: [...(task.attachments ?? []), attachment] }
      : task)));
  }, [workspaceSlug, replaceTask]);

  const removeAttachment = useCallback(async (id: string, attachmentId: string): Promise<void> => {
    if (!workspaceSlug) return;
    const saved = await tasksApi.removeAttachment(workspaceSlug, id, attachmentId);
    if (saved) {
      replaceTask(saved);
      return;
    }
    setTasks(current => current.map(task => (task._id === id
      ? { ...task, attachments: (task.attachments ?? []).filter(item => item._id !== attachmentId) }
      : task)));
  }, [workspaceSlug, replaceTask]);

  const downloadAttachment = useCallback(async (id: string, attachmentId: string): Promise<Blob> => {
    if (!workspaceSlug) throw new Error('No workspace selected.');
    return tasksApi.downloadAttachment(workspaceSlug, id, attachmentId);
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
    undoDelete,
    flushDeletes,
    addComment,
    removeComment,
    uploadAttachment,
    removeAttachment,
    downloadAttachment,
  };
};
