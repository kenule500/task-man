import mongoose, { Document, Schema } from 'mongoose';
import { AI_PROVIDER_IDS, type AiProviderId } from '../utils/ai/providers.js';
import { MAX_STAGE_KEY, MAX_STAGE_NAME, MAX_STAGE_WIP, MAX_STAGES, STAGE_COLORS, type WorkflowStage } from '../utils/workflow.js';
import { TASK_STATUSES } from './taskModel.js';

// Work-in-progress limits per board column (null = no limit)
export const WIP_STATUSES = ['pending', 'in-progress', 'completed'] as const;
export const MAX_WIP_LIMIT = 999;
export type WipLimits = Record<(typeof WIP_STATUSES)[number], number | null>;

export interface IWorkspace extends Document {
  name: string;
  slug: string;
  owner: mongoose.Types.ObjectId;
  members: {
    user: mongoose.Types.ObjectId;
    roleId: mongoose.Types.ObjectId;
    joinedAt: Date;
  }[];
  inviteCode: string;
  // Last task number handed out (task keys like WEB-12 use it)
  taskCounter: number;
  boardSettings?: { wipLimits?: Partial<WipLimits> };
  // Custom board stages (each mapped to a status group); unset = the default To do / In progress / Done
  workflow?: { stages?: WorkflowStage[] };
  // Workspace-wide security policy
  security?: { require2fa?: boolean };
  integrations?: {
    github?: {
      enabled?: boolean;
      // Shared webhook secret (HMAC key). Never selected by default: add '+integrations.github.secret' to read it
      secret?: string;
      // Move tasks along when their pull requests open or merge
      autoTransition?: boolean;
      connectedAt?: Date;
      // GitHub token for private repositories, read by the AI code review (AES-256-GCM via secretBox, bound to the workspace id).
      // Never selected by default: add '+integrations.github.accessTokenEncrypted' to read it
      accessTokenEncrypted?: string;
    };
  };
  // Workspace BYOK for the AI code review and the document plan. Code only leaves for the provider once the workspace opts in.
  ai?: {
    enabled?: boolean;
    autoReview?: boolean;
    provider?: AiProviderId;
    /** Only the custom preset uses it; presets supply their endpoint. */
    baseURL?: string;
    model?: string;
    /** AES-256-GCM ciphertext bound to the workspace id. Never selected by default. */
    apiKeyEncrypted?: string;
    /** Last four characters of the key, for display only. */
    keyHint?: string;
    configuredAt?: Date;
    configuredBy?: mongoose.Types.ObjectId;
    lastTestedAt?: Date;
    lastTestStatus?: 'success' | 'failed';
    lastTestCode?: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

const workspaceSchema: Schema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      index: true,
      match: /^[a-z0-9-]+$/,
    },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    members: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        roleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Role', required: true },
        joinedAt: { type: Date, default: Date.now },
      },
    ],
    inviteCode: { type: String, required: true, unique: true, index: true },
    taskCounter: { type: Number, default: 0, min: 0 },
    boardSettings: {
      wipLimits: {
        pending: { type: Number, default: null, min: 1, max: MAX_WIP_LIMIT },
        'in-progress': { type: Number, default: null, min: 1, max: MAX_WIP_LIMIT },
        completed: { type: Number, default: null, min: 1, max: MAX_WIP_LIMIT },
      },
    },
    workflow: {
      stages: {
        type: [new Schema({
          key: { type: String, required: true, match: /^[a-z0-9][a-z0-9-]*$/, maxlength: MAX_STAGE_KEY },
          name: { type: String, required: true, trim: true, minlength: 1, maxlength: MAX_STAGE_NAME },
          group: { type: String, enum: TASK_STATUSES, required: true },
          color: { type: String, enum: STAGE_COLORS, default: 'slate' },
          wipLimit: { type: Number, default: 0, min: 0, max: MAX_STAGE_WIP },
        }, { _id: false })],
        default: undefined,
        validate: {
          validator: (stages: unknown[]) => stages.length >= 1 && stages.length <= MAX_STAGES,
          message: `A workflow needs between 1 and ${MAX_STAGES} stages`,
        },
      },
    },
    security: {
      // Members without two-factor authentication get 403 TWO_FACTOR_REQUIRED on workspace routes
      require2fa: { type: Boolean, default: false },
    },
    integrations: {
      github: {
        enabled: { type: Boolean, default: false },
        secret: { type: String, select: false },
        autoTransition: { type: Boolean, default: true },
        connectedAt: { type: Date },
        accessTokenEncrypted: { type: String, select: false },
      },
    },
    ai: {
      enabled: { type: Boolean, default: false },
      autoReview: { type: Boolean, default: false },
      provider: { type: String, enum: AI_PROVIDER_IDS },
      baseURL: { type: String, trim: true, maxlength: 2048 },
      model: { type: String, trim: true, maxlength: 120 },
      apiKeyEncrypted: { type: String, select: false },
      keyHint: { type: String, maxlength: 8 },
      configuredAt: { type: Date },
      configuredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      lastTestedAt: { type: Date },
      lastTestStatus: { type: String, enum: ['success', 'failed'] },
      lastTestCode: { type: String, maxlength: 40 },
    },
  },
  { timestamps: true }
);

// Every permission check and the workspace switcher look workspaces up by member
workspaceSchema.index({ 'members.user': 1 });

const Workspace = mongoose.model<IWorkspace>('Workspace', workspaceSchema);
export default Workspace;