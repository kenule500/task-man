import api from '@/utils/api';
import type { SprintReport } from './lib/sprintReport';

export const planningApi = {
  sprintReport: async (slug: string, projectId: string, sprintId: string): Promise<SprintReport> => {
    const { data } = await api.get(
      `/workspaces/${encodeURIComponent(slug)}/projects/${encodeURIComponent(projectId)}/sprints/${encodeURIComponent(sprintId)}/report`,
    );
    return data;
  },
};
