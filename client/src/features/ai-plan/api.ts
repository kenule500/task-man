import api from '@/utils/api';
import type { AiPlan, CreatedFromPlan, PlanContent, PlanUploadOptions } from './types';

const part = (value: string) => encodeURIComponent(value);
const plansUrl = (slug: string) => `/workspaces/${part(slug)}/ai/plans`;

/** Form fields the server reads; an empty choice is left out so the server default applies. */
export const uploadFields = (options: PlanUploadOptions): [string, string][] => {
  const fields: [string, string][] = [
    ['sprintLengthWeeks', String(options.sprintLengthWeeks)],
    ['language', options.language],
  ];
  const optional: [string, string][] = [
    ['startDate', options.startDate.trim()],
    ['teamSize', options.teamSize.trim()],
    ['extraInstructions', options.extraInstructions.trim()],
  ];
  const destination = options.destination ?? (options.targetProjectId ? 'existing' : 'new');
  if (destination === 'new') {
    optional.unshift(['projectName', options.projectName.trim()], ['projectKey', options.projectKey.trim()]);
  } else if (options.targetProjectId) {
    optional.push(['targetProjectId', options.targetProjectId]);
  }
  return [...fields, ...optional.filter(([, value]) => value !== '')];
};

export const aiPlanApi = {
  /** Uploads the document and queues the generation (202); the work continues on the server. */
  upload: async (slug: string, file: File, options: PlanUploadOptions, signal?: AbortSignal): Promise<AiPlan> => {
    const body = new FormData();
    // Fields first, so the server has them when the file arrives
    for (const [name, value] of uploadFields(options)) body.append(name, value);
    body.append('file', file);
    const { data } = await api.post(plansUrl(slug), body, {
      // Let the browser set the multipart boundary
      headers: { 'Content-Type': 'multipart/form-data' },
      signal,
    });
    return data;
  },
  /** Status and, once ready, the plan (this is what polling reads). */
  get: async (slug: string, id: string, signal?: AbortSignal): Promise<AiPlan> => {
    const { data } = await api.get(`${plansUrl(slug)}/${part(id)}`, { signal });
    return data;
  },
  /** The latest 10 plans of the signed-in person, without their content. */
  list: async (slug: string): Promise<AiPlan[]> => {
    const { data } = await api.get(plansUrl(slug));
    return Array.isArray(data) ? data : [];
  },
  /** Saves the person's edits (validated by the server with the same rules). */
  update: async (slug: string, id: string, plan: PlanContent): Promise<AiPlan> => {
    const { data } = await api.patch(`${plansUrl(slug)}/${part(id)}`, { plan });
    return data;
  },
  /** Creates the project, or adds the plan to an existing one; omitting the target uses the destination stored at upload. */
  create: async (slug: string, id: string, targetProjectId?: string | null): Promise<CreatedFromPlan> => {
    const body = targetProjectId === undefined ? undefined : { targetProjectId };
    const { data } = await api.post(`${plansUrl(slug)}/${part(id)}/create`, body);
    return data;
  },
  /** Deletes the plan; one that is still generating is cancelled. */
  remove: async (slug: string, id: string): Promise<void> => {
    await api.delete(`${plansUrl(slug)}/${part(id)}`);
  },
};
