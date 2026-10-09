import mongoose from 'mongoose';
import Task from '../models/taskModel.js';
import Workspace from '../models/workspaceModel.js';

type Id = mongoose.Types.ObjectId | string;

/**
 * Reserves `count` consecutive task numbers in a workspace and returns the first one.
 * `$inc` is atomic, so concurrent requests never get the same number.
 */
export const reserveTaskNumbers = async (workspaceId: Id, count = 1): Promise<number> => {
  const workspace = await Workspace.findOneAndUpdate(
    { _id: workspaceId },
    { $inc: { taskCounter: count } },
    { returnDocument: 'after', projection: { taskCounter: 1 } },
  ).lean();
  if (!workspace) throw new Error('Workspace not found');
  return (workspace.taskCounter ?? count) - count + 1;
};

/** Gives a number to tasks created before task keys existed, oldest first. Cheap no-op once done. */
export const ensureTaskNumbers = async (workspaceId: Id): Promise<void> => {
  const missing = await Task.find({ workspace: workspaceId, number: { $exists: false } })
    .sort({ createdAt: 1, _id: 1 })
    .select('_id')
    .lean();
  if (missing.length === 0) return;

  const first = await reserveTaskNumbers(workspaceId, missing.length);
  await Task.bulkWrite(missing.map((task, index) => ({
    updateOne: {
      // Only fill the gap: a concurrent backfill that got there first keeps its number
      filter: { _id: task._id, number: { $exists: false } },
      update: { $set: { number: first + index } },
    },
  })), { ordered: false });
};
