import mongoose, { Document, Schema } from 'mongoose';

// What happened to the recipient, named "<subject>.<event>"
export const NOTIFICATION_TYPES = [
  'task.assigned', 'task.completed', 'comment.mention', 'comment.reply_on_my_task',
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

// In-app notifications are kept for 90 days, then MongoDB removes them (TTL index)
export const NOTIFICATION_RETENTION_DAYS = 90;
export const MAX_NOTIFICATION_SUMMARY = 140;

export interface INotification extends Document {
  // Recipient
  user: mongoose.Types.ObjectId;
  workspace: mongoose.Types.ObjectId;
  // Who caused it
  actor: mongoose.Types.ObjectId;
  type: NotificationType;
  task: mongoose.Types.ObjectId;
  // Task title at the time (kept readable if the task is renamed or deleted)
  summary: string;
  readAt?: Date | null;
  createdAt: Date;
}

const notificationSchema = new Schema<INotification>({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  workspace: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
  actor: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, enum: NOTIFICATION_TYPES, required: true },
  task: { type: Schema.Types.ObjectId, ref: 'Task', required: true },
  summary: { type: String, default: '', maxlength: MAX_NOTIFICATION_SUMMARY },
  readAt: { type: Date, default: null },
}, { timestamps: { createdAt: true, updatedAt: false } });

notificationSchema.index({ user: 1, readAt: 1, createdAt: -1 });
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: NOTIFICATION_RETENTION_DAYS * 24 * 60 * 60 });

const Notification = mongoose.model<INotification>('Notification', notificationSchema);
export default Notification;
