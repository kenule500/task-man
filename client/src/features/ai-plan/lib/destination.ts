import type { Project } from '@/features/projects';
import type { AiPlan, PlanDestination, PlanTarget } from '../types';

// Pure helpers for the destination choice. The server validates the target again; these keep the upload and review
// screens honest about what can be chosen and what happened to a target after the plan was generated.

/** Targets offered in the selector: projects of the workspace that are not archived. */
export const activeTargets = (projects: Project[]): Project[] => projects.filter(project => !project.archived);

export const targetOf = (projects: Project[], id: string | null | undefined): Project | undefined =>
  (id ? projects.find(project => project._id === id) : undefined);

export type TargetProblem = 'targetRequired' | 'targetMissing' | 'targetArchived';

/** The target as the screen knows it: the server's detail when it has one, otherwise the project directory. */
export const destinationTarget = (
  projects: Project[],
  id: string | null | undefined,
  serverTarget?: PlanTarget | null,
): PlanTarget | null => {
  if (!id) return null;
  if (serverTarget === null) return null;
  const server = serverTarget && String(serverTarget._id) === id ? serverTarget : undefined;
  const project = targetOf(projects, id);
  if (project) {
    return {
      _id: project._id,
      name: project.name,
      key: project.key,
      // The directory is fresher for a rename; the detail is fresher for an archive
      archived: Boolean(server?.archived ?? project.archived),
    };
  }
  return server ?? null;
};

/** Why the chosen destination cannot be used, or null when it can. */
export const targetProblem = (
  destination: PlanDestination,
  targetProjectId: string | null,
  projects: Project[],
  serverTarget?: PlanTarget | null,
): TargetProblem | null => {
  if (destination !== 'existing') return null;
  if (!targetProjectId) return 'targetRequired';
  const target = destinationTarget(projects, targetProjectId, serverTarget);
  if (!target) return 'targetMissing';
  if (target.archived) return 'targetArchived';
  return null;
};

/** The name and key shown in the banner and in the create button: `Online shop (SHOP)`. */
export const targetLabel = (target: Pick<PlanTarget, 'name' | 'key'>): string => `${target.name} (${target.key})`;

/** The target of a plan loaded from the API, falling back to the directory when the detail does not carry it. */
export const planTarget = (
  plan: Pick<AiPlan, 'options' | 'targetProject'>,
  projects: Project[],
): PlanTarget | null => destinationTarget(projects, plan.options.targetProjectId, plan.targetProject);

/** True when a plan belongs to this project: it was stored for it and has not been turned into a project yet. */
export const planBelongsToProject = (plan: Pick<AiPlan, 'status' | 'options'>, projectId: string): boolean =>
  plan.status !== 'created' && plan.options.targetProjectId === projectId;
