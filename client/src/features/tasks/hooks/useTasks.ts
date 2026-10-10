import { useCallback, useEffect, useMemo, useRef, useState, type SetStateAction } from 'react';
import { fetchCached, getCached, invalidate, setCached, subscribe, tasksKey } from '@/lib/queryCache';
import { cachedWorkflow } from '@/features/workflow/hooks/useWorkflow';
import type { WorkflowStage } from '@/features/workflow/types';
import { mergeCustom } from '@/features/fields/lib/fields';
import { TIME_CHANGED_EVENT } from '@/features/time/timerStore';
import { useLiveRefresh } from '@/features/live/hooks/useLiveRefresh';
import { getApiErrorMessage, getApiErrorStatus, isTaskPayload, tasksApi, type UploadOptions } from '../api';
import type { Task, TaskAttachment, TaskComment, TaskInput, TaskPatch, TaskUser } from '../types';

/** How long a deleted task can be restored before the delete request is sent. */
export const DELETE_UNDO_MS = 6000;

const UNKNOWN_USER = 'Member';

/** Applies a patch locally the way the server will store it (assignee ids become users). */
const applyPatch = (task: Task, patch: TaskPatch, directory: Map<string, TaskUser>, stages?: WorkflowStage[]): Task => {
  const { assignees, custom, ...rest } = patch;
  const next = { ...task, ...rest } as Task;
  if (custom) next.custom = mergeCustom(task.custom, custom);
  // A stage carries its status group with it
  const stage = patch.stage ? stages?.find(item => item.key === patch.stage) : undefined;
  if (stage) next.status = stage.group;
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
  // Stale-while-revalidate: a cached list shows at once (no skeleton) and is refreshed in the background
  const [allTasks, rawSetTasks] = useState<Task[]>(
    () => (workspaceSlug ? getCached<Task[]>(tasksKey(workspaceSlug)) : undefined) ?? [],
  );
  const [error, setError] = useState('');
  // Tasks hidden by a delete that can still be undone
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(() => new Set());
  // Workspace whose tasks are currently loaded; loading until it matches the URL
  const [loadedSlug, setLoadedSlug] = useState<string | null>(
    () => (workspaceSlug && getCached(tasksKey(workspaceSlug)) ? workspaceSlug : null),
  );
  const loading = Boolean(workspaceSlug) && loadedSlug !== workspaceSlug;

  // Switching workspace: adopt that workspace's cached list during render, so there is no skeleton flash
  const [seenSlug, setSeenSlug] = useState(workspaceSlug);
  if (seenSlug !== workspaceSlug) {
    setSeenSlug(workspaceSlug);
    const cached = workspaceSlug ? getCached<Task[]>(tasksKey(workspaceSlug)) : undefined;
    if (cached && workspaceSlug) {
      rawSetTasks(cached);
      setLoadedSlug(workspaceSlug);
    }
  }

  // Local changes counted so a slower background refresh never overwrites them
  const changesRef = useRef(0);
  const busyRef = useRef(0);
  // False after a failed load emptied the list: an empty fallback must not be cached as real data
  const cacheableRef = useRef(true);
  const setTasks = useCallback((update: SetStateAction<Task[]>) => {
    changesRef.current += 1;
    rawSetTasks(update);
  }, []);

  // Latest committed tasks, read by mutations to build rollbacks
  const tasksRef = useRef(allTasks);
  useEffect(() => {
    tasksRef.current = allTasks;
  }, [allTasks]);

  const pendingRef = useRef(new Map<string, PendingDelete>());

  /** Tasks the UI shows: pending deletes are hidden and no longer referenced as dependencies. */
  const tasks = useMemo(() => {
    if (pendingIds.size === 0) return allTasks;
    // Deleting a task deletes its subtasks, so they disappear with it
    const hidden = new Set(pendingIds);
    for (const task of allTasks) if (task.parent && pendingIds.has(task.parent)) hidden.add(task._id);
    return allTasks
      .filter(task => !hidden.has(task._id))
      .map(task => (task.dependencies?.some(dep => hidden.has(dep))
        ? { ...task, dependencies: task.dependencies.filter(dep => !hidden.has(dep)) }
        : task));
  }, [allTasks, pendingIds]);

  /** Sends the delete request of a pending task now (timer expired, or the user leaves). */
  const commitDelete = useCallback(async (id: string) => {
    const entry = pendingRef.current.get(id);
    if (!entry) return;
    clearTimeout(entry.timer);
    pendingRef.current.delete(id);
    busyRef.current += 1;
    try {
      await tasksApi.remove(entry.slug, id);
      // The server also deletes the subtasks and detaches the tasks from dependants; mirror that locally.
      setTasks(current => {
        const removed = new Set([id, ...current.filter(task => task.parent === id).map(task => task._id)]);
        return current
          .filter(task => !removed.has(task._id))
          .map(task => [...removed].reduce(detachDependency, task));
      });
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not delete the task.'));
    } finally {
      busyRef.current -= 1;
      // On failure the task reappears
      setPendingIds(current => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    }
  }, [setTasks]);

  const flushDeletes = useCallback(
    async () => { await Promise.all([...pendingRef.current.keys()].map(commitDelete)); },
    [commitDelete],
  );

  useEffect(() => {
    if (!workspaceSlug) return;
    let cancelled = false;
    const key = tasksKey(workspaceSlug);
    const hadCache = getCached(key) !== undefined;
    const changesAtStart = changesRef.current;
    cacheableRef.current = true;

    fetchCached(key, () => tasksApi.list(workspaceSlug))
      .then(list => {
        if (cancelled) return;
        // The user already changed something locally: their version is newer than this response
        if (changesRef.current === changesAtStart && busyRef.current === 0) rawSetTasks(list);
        setError('');
      })
      .catch(err => {
        if (cancelled) return;
        const status = getApiErrorStatus(err);
        const denied = status === 403 || status === 404;
        // Offline or flaky network with cached data: keep showing it and just report the problem
        if (denied || !hadCache) {
          rawSetTasks([]);
          cacheableRef.current = false;
          invalidate(key);
        }
        setError(denied
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

  // Keep the shared cache in step with what the UI shows (after loads, and once optimistic changes settle)
  useEffect(() => {
    if (!workspaceSlug || loadedSlug !== workspaceSlug || !cacheableRef.current || busyRef.current > 0) return;
    setCached(tasksKey(workspaceSlug), allTasks);
  }, [allTasks, loadedSlug, workspaceSlug]);

  // Another screen using the same workspace wrote newer data: follow it
  useEffect(() => {
    if (!workspaceSlug) return;
    const key = tasksKey(workspaceSlug);
    return subscribe(key, () => {
      const next = getCached<Task[]>(key);
      if (next && next !== tasksRef.current && busyRef.current === 0) rawSetTasks(next);
    });
  }, [workspaceSlug]);

  // Closing the tab must not silently drop a delete the user already saw as done
  useEffect(() => {
    const onPageHide = () => { void flushDeletes(); };
    window.addEventListener('pagehide', onPageHide);
    return () => window.removeEventListener('pagehide', onPageHide);
  }, [flushDeletes]);

  /** Fetches the list again, for changes made server-side (sprint start/complete move tasks around). */
  const reload = useCallback(async (): Promise<void> => {
    if (!workspaceSlug) return;
    try {
      const list = await fetchCached(tasksKey(workspaceSlug), () => tasksApi.list(workspaceSlug), true);
      cacheableRef.current = true;
      setTasks(list);
      setError('');
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to load tasks.'));
    }
  }, [workspaceSlug, setTasks]);

  // Teammates changed tasks (live feed): reload the list once, debounced. Never over this user's unsaved optimistic edits.
  const refreshFromLive = useCallback(async (): Promise<boolean> => {
    if (!workspaceSlug) return false;
    if (busyRef.current > 0) return true;
    const changesAtStart = changesRef.current;
    try {
      const list = await fetchCached(tasksKey(workspaceSlug), () => tasksApi.list(workspaceSlug));
      if (busyRef.current > 0 || changesRef.current !== changesAtStart) return true;
      cacheableRef.current = true;
      rawSetTasks(list);
    } catch {
      // The next change or poll tries again
    }
    return false;
  }, [workspaceSlug]);
  useLiveRefresh(workspaceSlug, 'tasks', refreshFromLive);

  // Logged time is kept by the server (timer stop, manual entry, delete): refresh so the badges follow
  useEffect(() => {
    const onTimeChanged = () => { void reload(); };
    window.addEventListener(TIME_CHANGED_EVENT, onTimeChanged);
    return () => window.removeEventListener(TIME_CHANGED_EVENT, onTimeChanged);
  }, [reload]);

  /** Creates a task (or a subtask when `input.parent` is set); throws so forms can show the server's validation message. */
  const createTask = useCallback(async (input: TaskInput): Promise<Task | null> => {
    if (!workspaceSlug) return null;
    busyRef.current += 1;
    try {
      const created = await tasksApi.create(workspaceSlug, input);
      setTasks(current => [...current, created]);
      return created;
    } finally {
      busyRef.current -= 1;
    }
  }, [workspaceSlug, setTasks]);

  /**
   * Optimistic update: the UI changes immediately and rolls back on failure.
   * Resolves to the saved task, or `null` when the change was rejected.
   */
  const updateTask = useCallback(async (id: string, patch: TaskPatch): Promise<Task | null> => {
    const previous = tasksRef.current.find(task => task._id === id);
    if (!workspaceSlug || !previous) return null;

    const directory = buildDirectory(tasksRef.current);
    setTasks(current => current.map(task => (task._id === id ? applyPatch(task, patch, directory, cachedWorkflow(workspaceSlug)) : task)));
    busyRef.current += 1;
    try {
      const saved = await tasksApi.update(workspaceSlug, id, patch);
      const regrouped = 'sprint' in patch || 'project' in patch;
      setTasks(current => current.map(task => {
        if (task._id === id) return saved;
        // Subtasks follow their parent between projects and sprints
        return regrouped && task.parent === id ? { ...task, project: saved.project, sprint: saved.sprint ?? null } : task;
      }));
      // Completing a repeating task makes the server create its next occurrence
      if (previous.recurrence && previous.status !== 'completed' && saved.status === 'completed') void reload();
      return saved;
    } catch (err) {
      setTasks(current => current.map(task => (task._id === id ? previous : task)));
      setError(getApiErrorMessage(err, 'Could not save your change.'));
      return null;
    } finally {
      busyRef.current -= 1;
    }
  }, [workspaceSlug, setTasks, reload]);

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
  }, [setTasks]);

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
  }, [workspaceSlug, replaceTask, setTasks]);

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
  }, [workspaceSlug, replaceTask, setTasks]);

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
  }, [workspaceSlug, replaceTask, setTasks]);

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
  }, [workspaceSlug, replaceTask, setTasks]);

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
    reload,
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
