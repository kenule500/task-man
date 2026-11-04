import mongoose, { Document, Schema } from 'mongoose';

export const RELEASE_STATUSES = ['unreleased', 'released', 'archived'] as const;
export type ReleaseStatus = (typeof RELEASE_STATUSES)[number];

export const MAX_RELEASE_NAME = 60;
export const MAX_RELEASE_DESCRIPTION = 2000;

export interface IRelease extends Document {
  workspace: mongoose.Types.ObjectId;
  project: mongoose.Types.ObjectId;
  // Version label such as "v1.2.0"; unique per project (case-insensitive)
  name: string;
  nameKey: string;
  description: string;
  startDate?: Date | null;
  releaseDate?: Date | null;
  status: ReleaseStatus;
  releasedAt?: Date | null;
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const releaseSchema = new Schema<IRelease>({
  workspace: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
  project: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
  name: { type: String, required: true, trim: true, minlength: 1, maxlength: MAX_RELEASE_NAME },
  nameKey: { type: String, required: true },
  description: { type: String, default: '', trim: true, maxlength: MAX_RELEASE_DESCRIPTION },
  startDate: { type: Date, default: null },
  releaseDate: { type: Date, default: null },
  status: { type: String, enum: RELEASE_STATUSES, default: 'unreleased' },
  releasedAt: { type: Date, default: null },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

releaseSchema.index({ workspace: 1, project: 1, nameKey: 1 }, { unique: true });

releaseSchema.pre('validate', function () {
  this.nameKey = (this.name ?? '').trim().toLowerCase();
});

const Release = mongoose.model<IRelease>('Release', releaseSchema);
export default Release;
