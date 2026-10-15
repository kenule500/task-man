import mongoose, { Document, Schema } from 'mongoose';

export const SPRINT_STATUSES = ['planned', 'active', 'completed'] as const;
export type SprintStatus = (typeof SPRINT_STATUSES)[number];

export const MAX_SPRINT_NAME = 60;
export const MAX_SPRINT_GOAL = 300;

export interface ISprint extends Document {
  workspace: mongoose.Types.ObjectId;
  project: mongoose.Types.ObjectId;
  name: string;
  goal: string;
  startDate: Date;
  endDate: Date;
  status: SprintStatus;
  startedAt?: Date;
  completedAt?: Date;
  // Story points finished when the sprint was completed (velocity history)
  completedPoints?: number;
  createdAt: Date;
  updatedAt: Date;
}

const sprintSchema = new Schema<ISprint>({
  workspace: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
  project: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
  name: { type: String, required: true, trim: true, minlength: 1, maxlength: MAX_SPRINT_NAME },
  goal: { type: String, default: '', trim: true, maxlength: MAX_SPRINT_GOAL },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  status: { type: String, enum: SPRINT_STATUSES, default: 'planned' },
  startedAt: { type: Date },
  completedAt: { type: Date },
  completedPoints: { type: Number, min: 0 },
}, { timestamps: true });

sprintSchema.index({ workspace: 1, project: 1, startDate: 1 });

const Sprint = mongoose.model<ISprint>('Sprint', sprintSchema);
export default Sprint;
