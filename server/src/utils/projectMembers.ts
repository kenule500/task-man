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

  // $addToSet on the array rather than load-and-save: a partially selected document would fail
  // full-document validation on fields it never loaded (e.g. `Path nameKey is required`), and this
  // is a single atomic write anyway.
  await Project.updateOne(
    { workspace: workspaceId, nameKey: name.toLowerCase() },
    { $addToSet: { members: { $each: assigneeIds.map(id => new mongoose.Types.ObjectId(String(id))) } } },
  );
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
