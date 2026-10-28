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
 * to the project's channel. Additive and idempotent: it never removes anyone, so a member is
 * not silently cut out of an audited conversation when their tasks change (spec §8.6).
 *
 * Returns the ids it actually added, diffed against the project's members before the `$addToSet`, so
 * a caller can tell a real grant from a no-op (FR-075, AC-079). An empty array means nobody new joined
 * and no channel event should be emitted (FR-078).
 */
export const addAssigneesToProjectMembers = async (
  workspaceId: mongoose.Types.ObjectId | string,
  projectName: string | null | undefined,
  assigneeIds: readonly (mongoose.Types.ObjectId | string)[],
): Promise<string[]> => {
  const name = (projectName ?? '').trim();
  if (!name || assigneeIds.length === 0) return [];

  const filter = { workspace: workspaceId, nameKey: name.toLowerCase() };
  const incoming = [...new Set(assigneeIds.map(id => String(id)).filter(Boolean))];
  if (incoming.length === 0) return [];

  // Read the member list first so the grant can be diffed: $addToSet alone cannot say what it added
  const before = await Project.findOne(filter).select('members').lean();
  const existing = new Set((before?.members ?? []).map(String));
  const added = incoming.filter(id => !existing.has(id));

  // $addToSet on the array rather than load-and-save: a partially selected document would fail
  // full-document validation on fields it never loaded (e.g. `Path nameKey is required`), and this
  // is a single atomic write anyway.
  await Project.updateOne(
    filter,
    { $addToSet: { members: { $each: incoming.map(id => new mongoose.Types.ObjectId(id)) } } },
  );

  // A second writer between the read and the write may have added someone first: their event is
  // dropped, which is the safe direction (a duplicate row, never a missing one)
  return added;
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
