import mongoose, { Document, Schema } from 'mongoose';

// "When <trigger>, if <conditions>, then <actions>" rules of a workspace (see utils/automation)
export const TRIGGER_TYPES = [
  'task.created', 'task.status_changed', 'task.assigned', 'task.priority_changed', 'task.commented', 'task.labeled',
] as const;
export const CONDITION_FIELDS = ['type', 'priority', 'status', 'label', 'assignee', 'sprint'] as const;
export const CONDITION_OPS = ['is', 'is_not', 'has', 'has_not', 'is_empty', 'is_not_empty', 'is_set'] as const;
export const ACTION_TYPES = [
  'set_status', 'set_priority', 'add_label', 'remove_label', 'assign_to', 'assign_to_actor',
  'unassign_all', 'add_comment', 'move_to_backlog',
] as const;

export type TriggerType = (typeof TRIGGER_TYPES)[number];
export type ConditionField = (typeof CONDITION_FIELDS)[number];
export type ConditionOp = (typeof CONDITION_OPS)[number];
export type ActionType = (typeof ACTION_TYPES)[number];

export const MAX_AUTOMATIONS_PER_WORKSPACE = 25;
export const MAX_AUTOMATION_NAME = 80;
export const MAX_AUTOMATION_CONDITIONS = 5;
export const MAX_AUTOMATION_ACTIONS = 5;
export const MAX_AUTOMATION_COMMENT = 500;
export const MAX_AUTOMATION_VALUE = 40;

export interface IAutomationTrigger {
  type: TriggerType;
  // Optional narrowing: the new status / priority, or the label that was added
  to?: string;
}

export interface IAutomationCondition {
  field: ConditionField;
  op: ConditionOp;
  value: string;
}

export interface IAutomationAction {
  type: ActionType;
  value: string;
}

export interface IAutomation extends Document {
  workspace: mongoose.Types.ObjectId;
  name: string;
  enabled: boolean;
  // Project name the rule is limited to; '' = every project
  project: string;
  trigger: IAutomationTrigger;
  conditions: IAutomationCondition[];
  actions: IAutomationAction[];
  runCount: number;
  lastRunAt?: Date | null;
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const triggerSchema = new Schema<IAutomationTrigger>({
  type: { type: String, enum: TRIGGER_TYPES, required: true },
  to: { type: String, trim: true, maxlength: MAX_AUTOMATION_VALUE, default: '' },
}, { _id: false });

const conditionSchema = new Schema<IAutomationCondition>({
  field: { type: String, enum: CONDITION_FIELDS, required: true },
  op: { type: String, enum: CONDITION_OPS, required: true },
  value: { type: String, trim: true, maxlength: MAX_AUTOMATION_VALUE, default: '' },
}, { _id: false });

const actionSchema = new Schema<IAutomationAction>({
  type: { type: String, enum: ACTION_TYPES, required: true },
  value: { type: String, trim: true, maxlength: MAX_AUTOMATION_COMMENT, default: '' },
}, { _id: false });

const automationSchema = new Schema<IAutomation>({
  workspace: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
  name: { type: String, required: true, trim: true, minlength: 1, maxlength: MAX_AUTOMATION_NAME },
  enabled: { type: Boolean, default: true },
  project: { type: String, default: '', trim: true, maxlength: 60 },
  trigger: { type: triggerSchema, required: true },
  conditions: {
    type: [conditionSchema],
    default: [],
    validate: { validator: (items: unknown[]) => items.length <= MAX_AUTOMATION_CONDITIONS, message: `A rule can have at most ${MAX_AUTOMATION_CONDITIONS} conditions` },
  },
  actions: {
    type: [actionSchema],
    default: [],
    validate: { validator: (items: unknown[]) => items.length >= 1 && items.length <= MAX_AUTOMATION_ACTIONS, message: `A rule needs 1 to ${MAX_AUTOMATION_ACTIONS} actions` },
  },
  runCount: { type: Number, default: 0, min: 0 },
  lastRunAt: { type: Date, default: null },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

automationSchema.index({ workspace: 1, enabled: 1, createdAt: 1 });

const Automation = mongoose.model<IAutomation>('Automation', automationSchema);
export default Automation;
