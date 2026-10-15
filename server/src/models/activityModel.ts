import mongoose, { Document, Schema } from 'mongoose';

// What happened, named "<subject>.<verb>" so the audit log can be filtered by area
export const ACTIVITY_ACTIONS = [
  'task.created', 'task.updated', 'task.deleted', 'task.commented', 'task.attachment_added', 'task.attachment_removed',
  'project.created', 'project.updated', 'project.deleted',
  'sprint.created', 'sprint.updated', 'sprint.started', 'sprint.completed', 'sprint.deleted',
  'member.role_changed', 'member.removed', 'member.joined', 'member.left',
  'role.created', 'role.updated', 'role.deleted', 'task.comment_deleted', 'invitation.sent', 'invitation.cancelled',
  'workspace.updated', 'workspace.invite_code_regenerated', 'audit.exported', 'integration.updated',
  'task.duplicated', 'automation.created', 'automation.updated', 'automation.deleted', 'automation.ran',
  'workflow.updated', 'webhook.created', 'webhook.updated', 'webhook.deleted', 'token.created', 'token.revoked',
  'time.logged', 'time.deleted', 'release.created', 'release.updated', 'release.deleted', 'release.released',
  'field.created', 'field.updated', 'field.deleted', 'import.completed',
  'page.created', 'page.updated', 'page.deleted',
] as const;

export type ActivityAction = (typeof ACTIVITY_ACTIONS)[number];

// Audit entries are kept for one year, then MongoDB removes them (TTL index)
export const ACTIVITY_RETENTION_DAYS = 365;
export const MAX_CHANGE_VALUE = 200;

export interface IActivityChange {
  field: string;
  from?: string;
  to?: string;
}

export interface IActivity extends Document {
  workspace: mongoose.Types.ObjectId;
  actor?: mongoose.Types.ObjectId;
  action: ActivityAction;
  // Human-readable subject, e.g. the task title at the time (kept after the task is deleted)
  summary: string;
  task?: mongoose.Types.ObjectId;
  project?: mongoose.Types.ObjectId;
  sprint?: mongoose.Types.ObjectId;
  changes: IActivityChange[];
  // Where the request came from (audit "where"); kept with the entry for the retention period
  ip?: string;
  userAgent?: string;
  createdAt: Date;
}

const changeSchema = new Schema<IActivityChange>({
  field: { type: String, required: true, maxlength: 40 },
  from: { type: String, maxlength: MAX_CHANGE_VALUE },
  to: { type: String, maxlength: MAX_CHANGE_VALUE },
}, { _id: false });

const activitySchema = new Schema<IActivity>({
  workspace: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
  actor: { type: Schema.Types.ObjectId, ref: 'User' },
  action: { type: String, enum: ACTIVITY_ACTIONS, required: true },
  summary: { type: String, default: '', maxlength: 200 },
  task: { type: Schema.Types.ObjectId, ref: 'Task' },
  project: { type: Schema.Types.ObjectId, ref: 'Project' },
  sprint: { type: Schema.Types.ObjectId, ref: 'Sprint' },
  changes: { type: [changeSchema], default: [] },
  ip: { type: String, maxlength: 64 },
  userAgent: { type: String, maxlength: 200 },
}, { timestamps: { createdAt: true, updatedAt: false } });

activitySchema.index({ workspace: 1, createdAt: -1 });
activitySchema.index({ workspace: 1, task: 1, createdAt: -1 });
activitySchema.index({ workspace: 1, actor: 1, createdAt: -1 });
activitySchema.index({ workspace: 1, action: 1, createdAt: -1 });
activitySchema.index({ createdAt: 1 }, { expireAfterSeconds: ACTIVITY_RETENTION_DAYS * 24 * 60 * 60 });

const Activity = mongoose.model<IActivity>('Activity', activitySchema);
export default Activity;
