import mongoose from 'mongoose';
import Project from '../../../models/projectModel.js';
import { AiQueueError } from '../reviewService.js';

// Resolves the project a plan is added to. Every lookup is scoped to the workspace, so a project of another
// workspace is indistinguishable from a missing one. A target is resolved again when the plan is created.

type Id = mongoose.Types.ObjectId | string;

export interface PlanTarget {
  _id: string;
  name: string;
  key: string;
  archived: boolean;
}

const asObjectId = (value: unknown): mongoose.Types.ObjectId => {
  if (value instanceof mongoose.Types.ObjectId) return value;
  if (typeof value !== 'string' || !mongoose.isValidObjectId(value.trim())) {
    throw new AiQueueError(400, 'TARGET_INVALID', 'The target project is not valid.');
  }
  return new mongoose.Types.ObjectId(value.trim());
};

/** Reads a project of the workspace, archived or not; `null` when it does not exist there. */
export const findTargetProject = async (workspaceId: Id, projectId: Id): Promise<PlanTarget | null> => {
  // Both sides are ObjectIds before they reach the query, so a crafted string can never become a
  // query operator. The query builder keeps the user-supplied id out of the query document itself.
  const project = await Project.findOne()
    .where('workspace').equals(asObjectId(workspaceId))
    .where('_id').equals(asObjectId(projectId))
    .select('name key archived')
    .lean();
  if (!project) return null;
  return {
    _id: String(project._id),
    name: project.name,
    key: project.key,
    archived: Boolean(project.archived),
  };
};

/** Validates a target sent by the client: an ObjectId of a project in this workspace that is not archived. */
export const resolveTargetProject = async (
  workspaceId: Id,
  value: unknown,
  { missingCode = 'TARGET_NOT_FOUND', missingStatus = 404 }: { missingCode?: 'TARGET_NOT_FOUND' | 'TARGET_UNAVAILABLE'; missingStatus?: number } = {},
): Promise<PlanTarget> => {
  const target = await findTargetProject(workspaceId, asObjectId(value));
  if (!target) throw new AiQueueError(missingStatus, missingCode, 'The target project no longer exists.');
  if (target.archived) throw new AiQueueError(409, 'TARGET_ARCHIVED', 'The target project is archived. Choose another project.');
  return target;
};
