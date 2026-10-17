import mongoose from 'mongoose';
import Project from '../models/projectModel.js';

/** Member ids in `existing` plus any new ones, de-duplicated and stable. */
export const mergeMemberIds = (
  existing: readonly (mongoose.Types.ObjectId | string)[],
  incoming: readonly (mongoose.Types.ObjectId | string)[],
): string[] => {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const id of [...existing, ...incoming]) {
    const key = String(id);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(key);
  }
  return merged;
};

export const withoutMember = (
  existing: readonly (mongoose.Types.ObjectId | string)[],
  userId: mongoose.Types.ObjectId | string,
): string[] => {
  const target = String(userId);
  return existing.map(String).filter(id => id !== target);
};

/**
 * Assigning someone a task makes them a member of that task's project, which is what grants access
 * to the project's team channel. Additive and idempotent: it never removes anyone, so a member is
 * not silently cut out of an audited conversation when their tasks change (spec §8.6).
 */
export const addAssigneesToProjectMembers = async (
  workspaceId: mongoose.Types.ObjectId | string,
  projectName: string | null | undefined,
  assigneeIds: readonly (mongoose.Types.ObjectId | string)[],
): Promise<void> => {
  const name = (projectName ?? '').trim();
  if (!name || assigneeIds.length === 0) return;

  const project = await Project.findOne({ workspace: workspaceId, nameKey: name.toLowerCase() })
    .select('members');
  if (!project) return;

  const merged = mergeMemberIds(project.members ?? [], assigneeIds);
  // Skip the write when everyone is already a member
  if (merged.length === (project.members ?? []).length) return;

  project.members = merged.map(id => new mongoose.Types.ObjectId(id));
  await project.save();
};

/** A member who leaves the workspace loses access to every project channel (spec FR-044). */
export const removeMemberFromAllProjects = async (
  workspaceId: mongoose.Types.ObjectId | string,
  userId: mongoose.Types.ObjectId | string,
): Promise<void> => {
  await Project.updateMany(
    { workspace: workspaceId, members: new mongoose.Types.ObjectId(String(userId)) },
    { $pull: { members: new mongoose.Types.ObjectId(String(userId)) } },
  );
};
