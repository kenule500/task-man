import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../../utils/api';
import type { Task, TaskInput, TaskStatus } from './types';

const UNDO_WINDOW_MS = 5000;

interface PendingDelete {
  task: Task;
  index: number;
  timeoutId: ReturnType<typeof setTimeout>;
}

export const useTasks = (workspaceSlug: string | undefined) => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pendingDeletes, setPendingDeletes] = useState<Record<string, PendingDelete>>({});
  const pendingRef = useRef(pendingDeletes);
  useEffect(() => {
    pendingRef.current = pendingDeletes;
  }, [pendingDeletes]);

  const fetchTasks = useCallback(async () => {
    if (!workspaceSlug) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const response = await api.get(`/workspaces/${workspaceSlug}/tasks`);
      setTasks(Array.isArray(response.data) ? response.data : []);
      setError('');
    } catch (err: unknown) {
      const axiosError = err as { response?: { status?: number; data?: { message?: string } } };
      if (axiosError.response?.status === 403 || axiosError.response?.status === 404) {
        setError(`You don't have access to "${workspaceSlug}". Use the workspace switcher to pick another one.`);
      } else {
        console.error('fetchTasks error:', err);
        setError('Failed to load tasks.');
      }
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, [workspaceSlug]);

  useEffect(() => {
    (async () => { await fetchTasks(); })();
  }, [fetchTasks]);

  // Clear any pending undo timers on unmount so we don't leak them.
  useEffect(() => {
    return () => {
      Object.values(pendingRef.current).forEach(p => clearTimeout(p.timeoutId));
    };
  }, []);

  const createTask = useCallback(async (input: TaskInput): Promise<Task> => {
    const response = await api.post(`/workspaces/${workspaceSlug}/tasks`, input);
    const created: Task = response.data;
    setTasks(prev => [...prev, created]);
    return created;
  }, [workspaceSlug]);

  const updateTask = useCallback(async (taskId: string, input: TaskInput): Promise<Task> => {
    const response = await api.put(`/workspaces/${workspaceSlug}/tasks/${taskId}`, input);
    const updated: Task = response.data;
    setTasks(prev => prev.map(t => (t._id === taskId ? updated : t)));
    return updated;
  }, [workspaceSlug]);

  // Optimistic status/order change — used by Kanban drag & drop so the UI
  // reacts instantly; reverts if the server rejects the move.
  const moveTask = useCallback(async (taskId: string, status: TaskStatus, order: number) => {
    let previous: Task | undefined;
    setTasks(prev => prev.map(t => {
      if (t._id === taskId) {
        previous = t;
        return { ...t, status, order };
      }
      return t;
    }));

    try {
      await api.patch(`/workspaces/${workspaceSlug}/tasks/${taskId}/move`, { status, order });
    } catch (err) {
      console.error('moveTask error:', err);
      if (previous) {
        setTasks(prev => prev.map(t => (t._id === taskId ? previous as Task : t)));
      }
      setError('Could not move the task. Please try again.');
    }
  }, [workspaceSlug]);

  // Optimistic delete with a short undo window instead of a confirm dialog.
  const requestDelete = useCallback((taskId: string) => {
    setTasks(prev => {
      const index = prev.findIndex(t => t._id === taskId);
      if (index === -1) return prev;
      const task = prev[index];

      const timeoutId = setTimeout(async () => {
        setPendingDeletes(curr => {
          const rest = { ...curr };
          delete rest[taskId];
          return rest;
        });
        try {
          await api.delete(`/workspaces/${workspaceSlug}/tasks/${taskId}`);
        } catch (err) {
          console.error('deleteTask error:', err);
          setTasks(curr => [...curr, task]);
          setError('Could not delete the task. It has been restored.');
        }
      }, UNDO_WINDOW_MS);

      setPendingDeletes(curr => ({ ...curr, [taskId]: { task, index, timeoutId } }));
      return prev.filter(t => t._id !== taskId);
    });
  }, [workspaceSlug]);

  const uploadCoverImage = useCallback(async (taskId: string, file: File): Promise<Task> => {
    const formData = new FormData();
    formData.append('image', file);
    const response = await api.post(`/workspaces/${workspaceSlug}/tasks/${taskId}/cover`, formData, {
      headers: { 'Content-Type': undefined },
    });
    const updated: Task = response.data;
    setTasks(prev => prev.map(t => (t._id === taskId ? updated : t)));
    return updated;
  }, [workspaceSlug]);

  const removeCoverImage = useCallback(async (taskId: string): Promise<Task> => {
    const response = await api.delete(`/workspaces/${workspaceSlug}/tasks/${taskId}/cover`);
    const updated: Task = response.data;
    setTasks(prev => prev.map(t => (t._id === taskId ? updated : t)));
    return updated;
  }, [workspaceSlug]);

  const addAttachment = useCallback(async (taskId: string, file: File): Promise<Task> => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post(`/workspaces/${workspaceSlug}/tasks/${taskId}/attachments`, formData, {
      headers: { 'Content-Type': undefined },
    });
    const updated: Task = response.data;
    setTasks(prev => prev.map(t => (t._id === taskId ? updated : t)));
    return updated;
  }, [workspaceSlug]);

  const removeAttachment = useCallback(async (taskId: string, attachmentId: string): Promise<Task> => {
    const response = await api.delete(`/workspaces/${workspaceSlug}/tasks/${taskId}/attachments/${attachmentId}`);
    const updated: Task = response.data;
    setTasks(prev => prev.map(t => (t._id === taskId ? updated : t)));
    return updated;
  }, [workspaceSlug]);

  const addComment = useCallback(async (taskId: string, text: string): Promise<Task> => {
    const response = await api.post(`/workspaces/${workspaceSlug}/tasks/${taskId}/comments`, { text });
    const updated: Task = response.data;
    setTasks(prev => prev.map(t => (t._id === taskId ? updated : t)));
    return updated;
  }, [workspaceSlug]);

  const removeComment = useCallback(async (taskId: string, commentId: string): Promise<Task> => {
    const response = await api.delete(`/workspaces/${workspaceSlug}/tasks/${taskId}/comments/${commentId}`);
    const updated: Task = response.data;
    setTasks(prev => prev.map(t => (t._id === taskId ? updated : t)));
    return updated;
  }, [workspaceSlug]);

  const undoDelete = useCallback((taskId: string) => {
    setPendingDeletes(curr => {
      const pending = curr[taskId];
      if (!pending) return curr;
      clearTimeout(pending.timeoutId);
      setTasks(prev => {
        const next = [...prev];
        const insertAt = Math.min(pending.index, next.length);
        next.splice(insertAt, 0, pending.task);
        return next;
      });
      const rest = { ...curr };
      delete rest[taskId];
      return rest;
    });
  }, []);

  return {
    tasks,
    loading,
    error,
    setError,
    refetch: fetchTasks,
    createTask,
    updateTask,
    moveTask,
    uploadCoverImage,
    removeCoverImage,
    addAttachment,
    removeAttachment,
    addComment,
    removeComment,
    requestDelete,
    undoDelete,
    pendingDeletes,
  };
};
