import api, { getApiErrorMessage } from '@/utils/api';
import type { LogTimeInput, RunningTimer, TaskTime, TimeEntry, Timesheet } from './types';

export { getApiErrorMessage };

const workspaceUrl = (slug: string) => `/workspaces/${encodeURIComponent(slug)}`;
const taskTimeUrl = (slug: string, taskId: string) => `${workspaceUrl(slug)}/tasks/${encodeURIComponent(taskId)}`;

export interface TimesheetQuery {
  /** ISO instants or YYYY-MM-DD (UTC days). */
  from?: string;
  to?: string;
  /** Managers only; everyone else always sees their own time. */
  user?: string;
  project?: string;
}

const cleanQuery = (query: TimesheetQuery): Record<string, string> =>
  Object.fromEntries(Object.entries(query).filter(([, value]) => Boolean(value))) as Record<string, string>;

export const timeApi = {
  forTask: async (slug: string, taskId: string): Promise<TaskTime> =>
    (await api.get<TaskTime>(`${taskTimeUrl(slug, taskId)}/time`)).data,

  log: async (slug: string, taskId: string, input: LogTimeInput): Promise<{ entry: TimeEntry; loggedMinutes: number }> =>
    (await api.post(`${taskTimeUrl(slug, taskId)}/time`, input)).data,

  remove: async (slug: string, taskId: string, entryId: string): Promise<{ loggedMinutes: number }> =>
    (await api.delete(`${taskTimeUrl(slug, taskId)}/time/${encodeURIComponent(entryId)}`)).data,

  start: async (slug: string, taskId: string): Promise<{ entry: TimeEntry; stopped: TimeEntry | null }> =>
    (await api.post(`${taskTimeUrl(slug, taskId)}/timer/start`)).data,

  stop: async (slug: string, taskId: string): Promise<{ entry: TimeEntry; loggedMinutes: number }> =>
    (await api.post(`${taskTimeUrl(slug, taskId)}/timer/stop`)).data,

  running: async (slug: string): Promise<RunningTimer | null> =>
    (await api.get<{ entry: RunningTimer | null }>(`${workspaceUrl(slug)}/time/running`)).data.entry,

  timesheet: async (slug: string, query: TimesheetQuery = {}, signal?: AbortSignal): Promise<Timesheet> =>
    (await api.get<Timesheet>(`${workspaceUrl(slug)}/time`, { params: cleanQuery(query), signal })).data,

  exportCsv: async (slug: string, query: TimesheetQuery = {}): Promise<Blob> =>
    (await api.get<Blob>(`${workspaceUrl(slug)}/time/export.csv`, { params: cleanQuery(query), responseType: 'blob' })).data,
};
