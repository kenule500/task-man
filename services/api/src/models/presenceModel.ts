import mongoose, { Document, Schema } from 'mongoose';

// "Also viewing": one row per person and task, refreshed by a heartbeat; MongoDB removes it after a minute (TTL index)
export const PRESENCE_TTL_SECONDS = 60;

export interface IPresence extends Document {
  workspace: mongoose.Types.ObjectId;
  task: mongoose.Types.ObjectId;
  user: mongoose.Types.ObjectId;
  seenAt: Date;
}

const presenceSchema = new Schema<IPresence>({
  workspace: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
  task: { type: Schema.Types.ObjectId, ref: 'Task', required: true },
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  seenAt: { type: Date, default: Date.now },
}, { versionKey: false });

presenceSchema.index({ workspace: 1, task: 1, user: 1 }, { unique: true });
presenceSchema.index({ seenAt: 1 }, { expireAfterSeconds: PRESENCE_TTL_SECONDS });

const Presence = mongoose.model<IPresence>('Presence', presenceSchema);
export default Presence;
