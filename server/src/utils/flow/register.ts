// Flow tracking: records status transitions from the activity stream (owned by the flow analytics module)
import mongoose from 'mongoose';
import StatusTransition from '../../models/statusTransitionModel.js';
import Task, { TASK_STATUSES, type TaskStatus } from '../../models/taskModel.js';
import { onActivity, type RecordedActivity } from '../activity.js';

let registered = false;

const isStatus = (value: unknown): value is TaskStatus => (TASK_STATUSES as readonly unknown[]).includes(value);

/** Writes the transition a recorded task activity stands for; subtasks and epics are not tracked. */
export const trackStatusTransition = async (entry: RecordedActivity): Promise<void> => {
  if (!entry.task || (entry.action !== 'task.created' && entry.action !== 'task.updated')) return;

  let from: TaskStatus | null = null;
  let to: TaskStatus | undefined;
  if (entry.action === 'task.updated') {
    const change = entry.changes?.find(item => item.field === 'status');
    if (!change || !isStatus(change.to)) return;
    from = isStatus(change.from) ? change.from : null;
    to = change.to;
  }

  const task = await Task.findOne({ _id: new mongoose.Types.ObjectId(String(entry.task)), workspace: new mongoose.Types.ObjectId(String(entry.workspace)) })
    .select('status project sprint type parent')
    .lean();
  if (!task || task.parent || task.type === 'epic') return;

  await StatusTransition.create({
    workspace: entry.workspace,
    task: task._id,
    project: task.project ?? '',
    sprint: task.sprint ?? null,
    type: task.type,
    from,
    to: to ?? task.status,
    at: entry.createdAt,
    actor: entry.actor,
  });
};

/** Subscribes flow tracking to recorded activity once per process. */
export const registerFlowTracking = (): void => {
  if (registered) return;
  registered = true;
  onActivity(async (_req, entry) => {
    try {
      await trackStatusTransition(entry);
    } catch (error) {
      console.error('flow tracking error:', (error as Error).message);
    }
  });
};
