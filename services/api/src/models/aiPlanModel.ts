import mongoose, { Document, Schema } from 'mongoose';
import type { PlanContent, PlanLanguage } from '../utils/ai/plan/schema.js';

// A project plan the AI drafted from an uploaded requirements document. The document itself is never stored:
// only the file name, its size and a short preview of the text (for the screen), and the generated plan.

export const AI_PLAN_STATUSES = ['queued', 'running', 'ready', 'failed', 'created'] as const;
export type AiPlanStatus = (typeof AI_PLAN_STATUSES)[number];

export const MAX_PLAN_PREVIEW = 2000;
/** Plans (and their previews) are removed after this long. */
export const AI_PLAN_RETENTION_DAYS = 30;

export interface IAiPlan extends Omit<Document, 'model'> {
  workspace: mongoose.Types.ObjectId;
  createdBy: mongoose.Types.ObjectId;
  status: AiPlanStatus;
  /** True while queued or running (one generating plan per person and workspace) */
  active: boolean;
  /** True while the project is being created from the plan (guards against a double click) */
  creating: boolean;
  source: { fileName: string; mimeType: string; size: number; chars: number; truncated: boolean; preview: string };
  options: {
    projectName: string;
    projectKey: string;
    sprintLengthWeeks: number;
    startDate: string;
    teamSize: number | null;
    extraInstructions: string;
    language: PlanLanguage;
    /** Project the plan is added to; null creates a new project. */
    targetProjectId: mongoose.Types.ObjectId | null;
  };
  plan: PlanContent | null;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
  /** Which path produced the plan; existing records and older fixtures may omit it. */
  analyzer?: 'documind' | 'ai';
  error: string;
  errorCode: string;
  projectId: mongoose.Types.ObjectId | null;
  /** Set when the person deleted or cancelled it: the content is gone, the row stays so the daily limit still counts it */
  deletedAt: Date | null;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
}

const aiPlanSchema = new Schema<IAiPlan>({
  workspace: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  status: { type: String, enum: AI_PLAN_STATUSES, default: 'queued' },
  active: { type: Boolean, default: true },
  creating: { type: Boolean, default: false },
  source: {
    fileName: { type: String, required: true, maxlength: 100 },
    mimeType: { type: String, required: true, maxlength: 100 },
    size: { type: Number, required: true, min: 0 },
    chars: { type: Number, required: true, min: 0 },
    truncated: { type: Boolean, default: false },
    preview: { type: String, default: '', maxlength: MAX_PLAN_PREVIEW },
  },
  options: {
    projectName: { type: String, default: '', maxlength: 60 },
    projectKey: { type: String, default: '', maxlength: 6 },
    sprintLengthWeeks: { type: Number, default: 2, min: 1, max: 4 },
    startDate: { type: String, required: true, maxlength: 10 },
    teamSize: { type: Number, default: null, min: 1, max: 200 },
    extraInstructions: { type: String, default: '', maxlength: 500 },
    language: { type: String, enum: ['en', 'fr', 'ar'], default: 'en' },
    targetProjectId: { type: Schema.Types.ObjectId, ref: 'Project', default: null },
  },
  // Validated by zod (utils/ai/plan/schema.ts) before every write
  plan: { type: Schema.Types.Mixed, default: null },
  model: { type: String, default: '', maxlength: 100 },
  usage: {
    inputTokens: { type: Number, default: 0 },
    outputTokens: { type: Number, default: 0 },
  },
  analyzer: { type: String, enum: ['documind', 'ai'], default: 'ai' },
  error: { type: String, default: '', maxlength: 500 },
  errorCode: { type: String, default: '', maxlength: 40 },
  projectId: { type: Schema.Types.ObjectId, ref: 'Project', default: null },
  deletedAt: { type: Date, default: null },
  startedAt: { type: Date },
  completedAt: { type: Date },
}, { timestamps: { createdAt: true, updatedAt: false }, minimize: false });

aiPlanSchema.index({ workspace: 1, createdBy: 1, createdAt: -1 });
// Two simultaneous uploads of one person in one workspace cannot both start generating
aiPlanSchema.index({ workspace: 1, createdBy: 1 }, { unique: true, partialFilterExpression: { active: true }, name: 'one_active_plan_per_user' });
// The daily limit counts a workspace's plans since midnight UTC
aiPlanSchema.index({ workspace: 1, createdAt: -1 });
aiPlanSchema.index({ createdAt: 1 }, { expireAfterSeconds: AI_PLAN_RETENTION_DAYS * 24 * 60 * 60 });

const AiPlan = mongoose.model<IAiPlan>('AiPlan', aiPlanSchema);
export default AiPlan;
