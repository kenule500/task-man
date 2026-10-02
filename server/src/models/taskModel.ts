import mongoose, { Document, Schema } from 'mongoose';

export const TASK_STATUSES = ['pending', 'in-progress', 'completed'] as const;
export const TASK_PRIORITIES = ['low', 'medium', 'high'] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export interface ITask extends Document {
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  startDate?: Date;
  deadline: Date;
  // Manual ordering inside a board column (lower comes first)
  position: number;
  // Tasks that must finish before this one can start (Gantt dependencies)
  dependencies: mongoose.Types.ObjectId[];
  owner: mongoose.Types.ObjectId;
  workspace: mongoose.Types.ObjectId;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const taskSchema: Schema = new Schema({
  title: { type: String, required: true, trim: true, maxlength: 140 },
  description: { type: String, default: '', trim: true, maxlength: 2000 },
  status: { type: String, enum: TASK_STATUSES, default: 'pending', index: true },
  priority: { type: String, enum: TASK_PRIORITIES, default: 'medium' },
  startDate: { type: Date },
  deadline: { type: Date, required: true, index: true },
  position: { type: Number, default: () => Date.now() },
  dependencies: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Task' }],
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
  completedAt: { type: Date },
}, {
  timestamps: true,
});

// Keep completedAt in sync with the status so reports can rely on it
taskSchema.pre('save', function () {
  const task = this as unknown as ITask;
  if (!task.isModified('status')) return;
  task.completedAt = task.status === 'completed' ? new Date() : undefined;
});

const Task = mongoose.model<ITask>('Task', taskSchema);
export default Task;
