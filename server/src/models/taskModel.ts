import mongoose, { Document, Schema } from 'mongoose';

export const TASK_STATUSES = ['pending', 'in-progress', 'completed'] as const;
export const TASK_PRIORITIES = ['low', 'medium', 'high'] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const MAX_LABELS = 10;
export const MAX_LABEL_LENGTH = 40;
export const MAX_COMMENT_LENGTH = 2000;
export const MAX_ATTACHMENTS = 20;

export interface ITaskComment {
  _id: mongoose.Types.ObjectId;
  author: mongoose.Types.ObjectId;
  text: string;
  createdAt: Date;
}

export interface ITaskAttachment {
  _id: mongoose.Types.ObjectId;
  // GridFS file id (bucket "attachments")
  fileId: mongoose.Types.ObjectId;
  originalName: string;
  mimetype: string;
  size: number;
  uploadedBy: mongoose.Types.ObjectId;
  uploadedAt: Date;
}

export interface ITask extends Document {
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  // Free-text label used to group tasks on the Projects page
  project: string;
  startDate?: Date;
  deadline: Date;
  // Manual ordering inside a board column (lower comes first)
  position: number;
  // Tasks that must finish before this one can start (Gantt dependencies)
  dependencies: mongoose.Types.ObjectId[];
  labels: string[];
  // Workspace members responsible for the task
  assignees: mongoose.Types.ObjectId[];
  comments: ITaskComment[];
  attachments: ITaskAttachment[];
  owner: mongoose.Types.ObjectId;
  workspace: mongoose.Types.ObjectId;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const commentSchema = new Schema<ITaskComment>({
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  text: { type: String, required: true, trim: true, minlength: 1, maxlength: MAX_COMMENT_LENGTH },
  createdAt: { type: Date, default: Date.now },
});

const attachmentSchema = new Schema<ITaskAttachment>({
  fileId: { type: mongoose.Schema.Types.ObjectId, required: true },
  originalName: { type: String, required: true, maxlength: 255 },
  mimetype: { type: String, required: true },
  size: { type: Number, required: true, min: 0 },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  uploadedAt: { type: Date, default: Date.now },
});

const taskSchema: Schema = new Schema({
  title: { type: String, required: true, trim: true, maxlength: 140 },
  description: { type: String, default: '', trim: true, maxlength: 2000 },
  status: { type: String, enum: TASK_STATUSES, default: 'pending' },
  priority: { type: String, enum: TASK_PRIORITIES, default: 'medium' },
  project: { type: String, default: '', trim: true, maxlength: 60 },
  startDate: { type: Date },
  deadline: { type: Date, required: true },
  position: { type: Number, default: () => Date.now() },
  dependencies: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Task' }],
  labels: {
    type: [{ type: String, trim: true, minlength: 1, maxlength: MAX_LABEL_LENGTH }],
    validate: {
      validator: (labels: string[]) =>
        labels.length <= MAX_LABELS && new Set(labels.map(l => l.toLowerCase())).size === labels.length,
      message: `A task can have at most ${MAX_LABELS} unique labels`,
    },
  },
  assignees: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  comments: [commentSchema],
  attachments: {
    type: [attachmentSchema],
    validate: {
      validator: (items: unknown[]) => items.length <= MAX_ATTACHMENTS,
      message: `A task can have at most ${MAX_ATTACHMENTS} attachments`,
    },
  },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
  completedAt: { type: Date },
}, {
  timestamps: true,
});

// Workspace lists are sorted by these fields
taskSchema.index({ workspace: 1, deadline: 1 });
taskSchema.index({ workspace: 1, position: 1 });
taskSchema.index({ workspace: 1, assignees: 1 });
taskSchema.index({ workspace: 1, labels: 1 });

// Keep completedAt in sync with the status so reports can rely on it
taskSchema.pre('save', function () {
  const task = this as unknown as ITask;
  if (!task.isModified('status')) return;
  task.completedAt = task.status === 'completed' ? new Date() : undefined;
});

const Task = mongoose.model<ITask>('Task', taskSchema);
export default Task;
