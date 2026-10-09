import api, { getApiErrorMessage } from '@/utils/api';
import type { Task, TaskAttachment, TaskComment, TaskInput, TaskPatch } from './types';

export { getApiErrorMessage };

const tasksUrl = (workspaceSlug: string) => `/workspaces/${encodeURIComponent(workspaceSlug)}/tasks`;
const taskUrl = (workspaceSlug: string, id: string) => `${tasksUrl(workspaceSlug)}/${encodeURIComponent(id)}`;

/** Mutations on comments/attachments answer with the updated task or with the created item. */
export type TaskOrItem<T> = Task | T;

/** True when a response body is a whole task (it carries the `comments`/`attachments` arrays). */
export const isTaskPayload = (value: unknown): value is Task =>
  typeof value === 'object' && value !== null && 'title' in value && 'deadline' in value;

export interface UploadOptions {
  /** Called with 0-100 while the file is sent. */
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
}

export type TaskActivityAction =
  | 'task.created' | 'task.updated' | 'task.deleted' | 'task.commented'
  | 'task.attachment_added' | 'task.attachment_removed';

export interface TaskActivityChange {
  field: string;
  from?: string;
  to?: string;
}

export interface TaskActivityEntry {
  _id: string;
  action: TaskActivityAction;
  summary?: string;
  actor: { _id: string; name: string; avatarUrl?: string } | null;
  changes: TaskActivityChange[];
  createdAt: string;
}

export interface TaskActivityPage {
  items: TaskActivityEntry[];
  /** Pass as `before` to get the next (older) page; null on the last page. */
  nextBefore: string | null;
}

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
    const { data } = await api.patch(taskUrl(workspaceSlug, id), patch);
    return data;
  },
  remove: async (workspaceSlug: string, id: string): Promise<void> => {
    await api.delete(taskUrl(workspaceSlug, id));
  },

  /** History of one task, newest first. */
  activity: async (
    workspaceSlug: string,
    id: string,
    { before, limit }: { before?: string | null; limit?: number } = {},
  ): Promise<TaskActivityPage> => {
    const { data } = await api.get(`${taskUrl(workspaceSlug, id)}/activity`, {
      params: { ...(before ? { before } : {}), ...(limit ? { limit } : {}) },
    });
    return {
      items: Array.isArray(data?.items) ? data.items : [],
      nextBefore: typeof data?.nextBefore === 'string' ? data.nextBefore : null,
    };
  },

  addComment: async (workspaceSlug: string, id: string, text: string): Promise<TaskOrItem<TaskComment>> => {
    const { data } = await api.post(`${taskUrl(workspaceSlug, id)}/comments`, { text });
    return data;
  },
  removeComment: async (workspaceSlug: string, id: string, commentId: string): Promise<Task | undefined> => {
    const { data } = await api.delete(`${taskUrl(workspaceSlug, id)}/comments/${encodeURIComponent(commentId)}`);
    return isTaskPayload(data) ? data : undefined;
  },

  uploadAttachment: async (
    workspaceSlug: string,
    id: string,
    file: File,
    { onProgress, signal }: UploadOptions = {},
  ): Promise<TaskOrItem<TaskAttachment>> => {
    const body = new FormData();
    body.append('file', file);
    const { data } = await api.post(`${taskUrl(workspaceSlug, id)}/attachments`, body, {
      // Let the browser set the multipart boundary
      headers: { 'Content-Type': 'multipart/form-data' },
      signal,
      onUploadProgress: event => {
        if (onProgress && event.total) onProgress(Math.round((event.loaded / event.total) * 100));
      },
    });
    return data;
  },
  /** Downloads need the auth header, so the file is fetched as a blob. */
  downloadAttachment: async (workspaceSlug: string, id: string, attachmentId: string): Promise<Blob> => {
    const { data } = await api.get(`${taskUrl(workspaceSlug, id)}/attachments/${encodeURIComponent(attachmentId)}`, {
      responseType: 'blob',
    });
    return data;
  },
  removeAttachment: async (workspaceSlug: string, id: string, attachmentId: string): Promise<Task | undefined> => {
    const { data } = await api.delete(`${taskUrl(workspaceSlug, id)}/attachments/${encodeURIComponent(attachmentId)}`);
    return isTaskPayload(data) ? data : undefined;
  },
};

export const getApiErrorStatus = (error: unknown): number | undefined =>
  (error as { response?: { status?: number } }).response?.status;
