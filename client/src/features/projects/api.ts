import api from '@/utils/api';
import type { MoveOpenTo, Project, ProjectInput, ProjectPatch, Sprint, SprintInput, SprintPatch } from './types';

const projectsUrl = (slug: string) => `/workspaces/${encodeURIComponent(slug)}/projects`;
const projectUrl = (slug: string, id: string) => `${projectsUrl(slug)}/${encodeURIComponent(id)}`;
const sprintUrl = (slug: string, projectId: string, sprintId: string) =>
  `${projectUrl(slug, projectId)}/sprints/${encodeURIComponent(sprintId)}`;

export const projectsApi = {
  list: async (slug: string): Promise<Project[]> => {
    const { data } = await api.get(projectsUrl(slug));
    return Array.isArray(data) ? data : [];
  },
  create: async (slug: string, input: ProjectInput): Promise<Project> => {
    const { data } = await api.post(projectsUrl(slug), input);
    return data;
  },
  update: async (slug: string, id: string, patch: ProjectPatch): Promise<Project> => {
    const { data } = await api.patch(projectUrl(slug, id), patch);
    return data;
  },
  remove: async (slug: string, id: string): Promise<void> => {
    await api.delete(projectUrl(slug, id));
  },

  createSprint: async (slug: string, projectId: string, input: SprintInput): Promise<Sprint> => {
    const { data } = await api.post(`${projectUrl(slug, projectId)}/sprints`, input);
    return data;
  },
  updateSprint: async (slug: string, projectId: string, sprintId: string, patch: SprintPatch): Promise<Sprint> => {
    const { data } = await api.patch(sprintUrl(slug, projectId, sprintId), patch);
    return data;
  },
  startSprint: async (slug: string, projectId: string, sprintId: string): Promise<Sprint> => {
    const { data } = await api.post(`${sprintUrl(slug, projectId, sprintId)}/start`);
    return data;
  },
  completeSprint: async (
    slug: string,
    projectId: string,
    sprintId: string,
    moveOpenTo: MoveOpenTo = 'backlog',
  ): Promise<{ sprint: Sprint; movedTasks: number }> => {
    const { data } = await api.post(`${sprintUrl(slug, projectId, sprintId)}/complete`, { moveOpenTo });
    return data;
  },
  removeSprint: async (slug: string, projectId: string, sprintId: string): Promise<void> => {
    await api.delete(sprintUrl(slug, projectId, sprintId));
  },
};
