import mongoose, { Document, Schema } from 'mongoose';

export const MAX_TIME_NOTE_LENGTH = 200;

export interface ITimeEntry extends Document {
  workspace: mongoose.Types.ObjectId;
  task: mongoose.Types.ObjectId;
  user: mongoose.Types.ObjectId;
  startedAt: Date;
  // null while the timer is running
  endedAt: Date | null;
  // Whole minutes; 0 while the timer is running
  minutes: number;
  note: string;
  // True only for the user's running timer (backs the one-timer-per-user-per-workspace index)
  running: boolean;
  createdAt: Date;
}

const timeEntrySchema = new Schema<ITimeEntry>({
  workspace: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
  task: { type: Schema.Types.ObjectId, ref: 'Task', required: true },
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  startedAt: { type: Date, required: true },
  endedAt: { type: Date, default: null },
  minutes: { type: Number, default: 0, min: 0 },
  note: { type: String, default: '', trim: true, maxlength: MAX_TIME_NOTE_LENGTH },
  running: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

timeEntrySchema.index({ workspace: 1, user: 1, startedAt: 1 });
timeEntrySchema.index({ task: 1 });
// One running timer per user per workspace, even when two start requests race
timeEntrySchema.index({ workspace: 1, user: 1 }, { unique: true, partialFilterExpression: { running: true } });

const TimeEntry = mongoose.model<ITimeEntry>('TimeEntry', timeEntrySchema);
export default TimeEntry;
