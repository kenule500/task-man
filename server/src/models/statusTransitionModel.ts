import mongoose, { Document, Schema } from 'mongoose';
import { TASK_STATUSES, TASK_TYPES, type TaskStatus, type TaskType } from './taskModel.js';

/**
 * One move of a task between statuses (`from` is null when the task was created).
 * Flow analytics (cumulative flow, cycle and lead time) are rebuilt from these rows. Kept without a TTL:
 * the history of a task is small and the charts reach back as far as the data does.
 */
export interface IStatusTransition extends Document {
  workspace: mongoose.Types.ObjectId;
  task: mongoose.Types.ObjectId;
  // Project name as tasks store it ('' = none), and the sprint, both as they were at the time
  project: string;
  sprint?: mongoose.Types.ObjectId | null;
  type: TaskType;
  from: TaskStatus | null;
  to: TaskStatus;
  at: Date;
  actor?: mongoose.Types.ObjectId;
}

const statusTransitionSchema = new Schema<IStatusTransition>({
  workspace: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
  task: { type: Schema.Types.ObjectId, ref: 'Task', required: true },
  project: { type: String, default: '', maxlength: 60 },
  sprint: { type: Schema.Types.ObjectId, ref: 'Sprint', default: null },
  type: { type: String, enum: TASK_TYPES, default: 'task' },
  from: { type: String, enum: [...TASK_STATUSES, null], default: null },
  to: { type: String, enum: TASK_STATUSES, required: true },
  at: { type: Date, required: true, default: Date.now },
  actor: { type: Schema.Types.ObjectId, ref: 'User' },
}, { versionKey: false });

statusTransitionSchema.index({ workspace: 1, at: 1 });
statusTransitionSchema.index({ workspace: 1, task: 1, at: 1 });

const StatusTransition = mongoose.model<IStatusTransition>('StatusTransition', statusTransitionSchema);
export default StatusTransition;
