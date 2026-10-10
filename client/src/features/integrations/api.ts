import api from '@/utils/api';
import type { GitHubIntegration } from './types';

const githubUrl = (slug: string, suffix = '') =>
  `/workspaces/${encodeURIComponent(slug)}/integrations/github${suffix}`;

export const integrationsApi = {
  getGitHub: async (slug: string): Promise<GitHubIntegration> => {
    const { data } = await api.get(githubUrl(slug));
    return data;
  },
  enableGitHub: async (slug: string): Promise<GitHubIntegration> => {
    const { data } = await api.post(githubUrl(slug, '/enable'));
    return data;
  },
  regenerateGitHubSecret: async (slug: string): Promise<GitHubIntegration> => {
    const { data } = await api.post(githubUrl(slug, '/regenerate-secret'));
    return data;
  },
  setGitHubAutoTransition: async (slug: string, autoTransition: boolean): Promise<GitHubIntegration> => {
    const { data } = await api.patch(githubUrl(slug), { autoTransition });
    return data;
  },
  disableGitHub: async (slug: string): Promise<GitHubIntegration> => {
    const { data } = await api.post(githubUrl(slug, '/disable'));
    return data;
  },
};
