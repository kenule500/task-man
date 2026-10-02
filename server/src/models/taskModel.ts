import mongoose, { Document, Schema } from 'mongoose';

export type TaskStatus = 'pending' | 'in-progress' | 'completed';
export type TaskPriority = 'low' | 'medium' | 'high';

export interface ITaskAttachment {
  _id: mongoose.Types.ObjectId;
  filename: string;
  originalName: string;
  url: string;
  mimetype: string;
  size: number;
  uploadedAt: Date;
}

export interface ITaskComment {
  _id: mongoose.Types.ObjectId;
  author: mongoose.Types.ObjectId;
  text: string;
  createdAt: Date;
}

export interface ITask extends Document {
  workspace: mongoose.Types.ObjectId;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  labels: string[];
  startDate?: Date;
  deadline?: Date;
  order: number;
  assignees: mongoose.Types.ObjectId[];
  createdBy: mongoose.Types.ObjectId;
  dependencies: mongoose.Types.ObjectId[];
  coverImage?: { url: string; filename: string };
  attachments: ITaskAttachment[];
  comments: ITaskComment[];
  createdAt: Date;
  updatedAt: Date;
}

const attachmentSchema = new Schema<ITaskAttachment>({
  filename: { type: String, required: true },
  originalName: { type: String, required: true },
  url: { type: String, required: true },
  mimetype: { type: String, required: true },
  size: { type: Number, required: true },
  uploadedAt: { type: Date, default: Date.now },
});

const commentSchema = new Schema<ITaskComment>({
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  text: { type: String, required: true, trim: true, maxlength: 2000 },
  createdAt: { type: Date, default: Date.now },
});

const taskSchema: Schema = new Schema({
  workspace: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true, index: true },
  title: { type: String, required: true, trim: true, maxlength: 200 },
  description: { type: String, default: '', trim: true, maxlength: 2000 },
  status: {
    type: String,
    enum: ['pending', 'in-progress', 'completed'],
    default: 'pending',
    index: true,
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high'],
    default: 'medium',
  },
  labels: [{ type: String, trim: true, maxlength: 40 }],
  startDate: { type: Date },
  deadline: { type: Date },
  order: { type: Number, default: 0 },
  assignees: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  dependencies: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Task' }],
  coverImage: {
    url: { type: String },
    filename: { type: String },
  },
  attachments: [attachmentSchema],
  comments: [commentSchema],
}, {
  timestamps: true,
});

taskSchema.index({ workspace: 1, status: 1, order: 1 });

const Task = mongoose.model<ITask>('Task', taskSchema);
export default Task;
