import api from '@/utils/api';
import type { Task, TaskInput, TaskPatch } from './types';

const tasksUrl = (workspaceSlug: string) => `/workspaces/${encodeURIComponent(workspaceSlug)}/tasks`;

export const tasksApi = {
  list: async (workspaceSlug: string): Promise<Task[]> => {
    const { data } = await api.get(tasksUrl(workspaceSlug));
    return Array.isArray(data) ? data : [];
  },
  create: async (workspaceSlug: string, input: TaskInput): Promise<Task> => {
    const { data } = await api.post(tasksUrl(workspaceSlug), input);
    return data;
  },
  update: async (workspaceSlug: string, id: string, patch: TaskPatch): Promise<Task> => {
    const { data } = await api.patch(`${tasksUrl(workspaceSlug)}/${id}`, patch);
    return data;
  },
  remove: async (workspaceSlug: string, id: string): Promise<void> => {
    await api.delete(`${tasksUrl(workspaceSlug)}/${id}`);
  },
};

/** Extracts a readable message from an API error (express-validator or `{ message }`). */
export const getApiErrorMessage = (error: unknown, fallback: string): string => {
  const data = (error as { response?: { data?: { message?: string; errors?: { msg: string }[] } } })
    .response?.data;
  return data?.message || data?.errors?.[0]?.msg || fallback;
};

export const getApiErrorStatus = (error: unknown): number | undefined =>
  (error as { response?: { status?: number } }).response?.status;
