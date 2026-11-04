import mongoose, { Document, Schema } from 'mongoose';

export const CUSTOM_FIELD_TYPES = ['text', 'number', 'date', 'select', 'multiselect', 'checkbox', 'url', 'user'] as const;
export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number];

// Stage palette names understood by the client
export const CUSTOM_FIELD_COLORS = ['slate', 'blue', 'violet', 'amber', 'emerald', 'rose', 'cyan'] as const;
export type CustomFieldColor = (typeof CUSTOM_FIELD_COLORS)[number];

export const MAX_FIELD_NAME = 40;
export const MAX_FIELD_OPTION_LABEL = 40;
export const MAX_FIELD_OPTIONS = 30;
// Active (not archived) fields per workspace
export const MAX_ACTIVE_FIELDS = 30;
export const MAX_FIELD_PROJECTS = 50;
export const FIELD_KEY_PATTERN = /^[a-z][a-z0-9_]{0,29}$/;

export interface ICustomFieldOption {
  id: string;
  label: string;
  color: CustomFieldColor;
}

export interface ICustomField extends Document {
  workspace: mongoose.Types.ObjectId;
  // Slug used as the key under task.custom; immutable
  key: string;
  name: string;
  type: CustomFieldType;
  // Choices of select and multiselect fields
  options: ICustomFieldOption[];
  // Project names the field applies to; empty = every project
  projects: string[];
  // Must be filled when a task is created (in a project the field applies to)
  required: boolean;
  order: number;
  archived: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const optionSchema = new Schema<ICustomFieldOption>({
  id: { type: String, required: true, match: /^[a-z0-9]{4,16}$/ },
  label: { type: String, required: true, trim: true, minlength: 1, maxlength: MAX_FIELD_OPTION_LABEL },
  color: { type: String, enum: CUSTOM_FIELD_COLORS, default: 'slate' },
}, { _id: false });

const customFieldSchema = new Schema<ICustomField>({
  workspace: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
  key: { type: String, required: true, match: FIELD_KEY_PATTERN },
  name: { type: String, required: true, trim: true, minlength: 1, maxlength: MAX_FIELD_NAME },
  type: { type: String, enum: CUSTOM_FIELD_TYPES, required: true },
  options: {
    type: [optionSchema],
    validate: { validator: (items: unknown[]) => items.length <= MAX_FIELD_OPTIONS, message: `A field can have at most ${MAX_FIELD_OPTIONS} options` },
  },
  projects: {
    type: [{ type: String, trim: true, maxlength: 60 }],
    validate: { validator: (items: unknown[]) => items.length <= MAX_FIELD_PROJECTS, message: `A field can apply to at most ${MAX_FIELD_PROJECTS} projects` },
  },
  required: { type: Boolean, default: false },
  order: { type: Number, default: 0 },
  archived: { type: Boolean, default: false },
}, { timestamps: true });

customFieldSchema.index({ workspace: 1, key: 1 }, { unique: true });
customFieldSchema.index({ workspace: 1, order: 1 });

const CustomField = mongoose.model<ICustomField>('CustomField', customFieldSchema);
export default CustomField;
