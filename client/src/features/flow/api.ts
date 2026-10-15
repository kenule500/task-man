import api from '@/utils/api';
import type { FlowParams, FlowReport } from './types';

export const flowApi = {
  report: async (slug: string, params: FlowParams): Promise<FlowReport> => {
    const { data } = await api.get(`/workspaces/${encodeURIComponent(slug)}/reports/flow`, {
      params: {
        from: params.from,
        to: params.to,
        ...(params.project ? { project: params.project } : {}),
        ...(params.sprint ? { sprint: params.sprint } : {}),
      },
    });
    return data;
  },
};
