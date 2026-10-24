import api from '@/utils/api';
import type { AiProviderInput, AiProviderTestResult, AiReview, AiSettings, AiSettingsPatch } from './types';

const part = (value: string) => encodeURIComponent(value);
const settingsUrl = (slug: string) => `/workspaces/${part(slug)}/ai`;
const reviewsUrl = (slug: string, taskId: string, suffix = '') =>
  `/workspaces/${part(slug)}/tasks/${part(taskId)}/ai-review${suffix}`;

export const aiReviewApi = {
  getSettings: async (slug: string): Promise<AiSettings> => {
    const { data } = await api.get(settingsUrl(slug));
    return data;
  },
  updateSettings: async (slug: string, patch: AiSettingsPatch): Promise<AiSettings> => {
    const { data } = await api.patch(settingsUrl(slug), patch);
    return data;
  },
  saveProvider: async (slug: string, input: AiProviderInput): Promise<AiSettings> => {
    const { data } = await api.put(`${settingsUrl(slug)}/provider`, input);
    return data;
  },
  removeProvider: async (slug: string): Promise<AiSettings> => {
    const { data } = await api.delete(`${settingsUrl(slug)}/provider`);
    return data;
  },
  testProvider: async (slug: string, input?: AiProviderInput): Promise<AiProviderTestResult> => {
    const { data } = await api.post(`${settingsUrl(slug)}/provider/test`, input ?? {});
    return data;
  },
  /** Queues a review of the task's linked pull request (or of `prUrl`); the work continues on the server. */
  run: async (slug: string, taskId: string, prUrl?: string): Promise<AiReview> => {
    const { data } = await api.post(reviewsUrl(slug, taskId), prUrl ? { prUrl } : {});
    return data;
  },
  /** The latest 10 reviews, newest first, without criteria and issues. */
  list: async (slug: string, taskId: string): Promise<AiReview[]> => {
    const { data } = await api.get(`${reviewsUrl(slug, taskId)}s`);
    return Array.isArray(data) ? data : [];
  },
  get: async (slug: string, taskId: string, reviewId: string): Promise<AiReview> => {
    const { data } = await api.get(`${reviewsUrl(slug, taskId)}s/${part(reviewId)}`);
    return data;
  },
};
