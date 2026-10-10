import api from '@/utils/api';
import type { WorkflowStage, WorkflowUpdate } from './types';

const workflowUrl = (slug: string) => `/workspaces/${encodeURIComponent(slug)}/workflow`;

const stagesOf = (data: unknown): WorkflowStage[] =>
  data && typeof data === 'object' && Array.isArray((data as { stages?: unknown }).stages)
    ? (data as { stages: WorkflowStage[] }).stages
    : [];

export const workflowApi = {
  get: async (slug: string): Promise<WorkflowStage[]> => {
    const { data } = await api.get(workflowUrl(slug));
    return stagesOf(data);
  },
  save: async (slug: string, update: WorkflowUpdate): Promise<WorkflowStage[]> => {
    const { data } = await api.put(workflowUrl(slug), update);
    return stagesOf(data);
  },
};
