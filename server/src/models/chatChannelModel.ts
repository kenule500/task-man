import mongoose, { Document, Schema } from 'mongoose';

// team and general are seeded once per workspace; project follows a Project; direct is a two-person conversation
export const CHANNEL_KINDS = ['team', 'general', 'project', 'direct'] as const;
export type ChannelKind = (typeof CHANNEL_KINDS)[number];

export const MAX_CHANNEL_NAME = 60;
export const MAX_DIRECT_PARTICIPANTS = 2;

export interface IChatChannel extends Document {
  workspace: mongoose.Types.ObjectId;
  kind: ChannelKind;
  name: string;
  // Lower-cased name: one channel per name, kind and workspace
  nameKey: string;
  // Project channels only
  project?: mongoose.Types.ObjectId | null;
  // Direct channels only
  participants: mongoose.Types.ObjectId[];
  // Stable key for the participant pair, so two people cannot accumulate duplicate direct channels
  directKey?: string | null;
  archived: boolean;
  lastMessageAt?: Date | null;
  lastMessageAuthor?: mongoose.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Sorted ids joined by ":", so a pair always produces the same key regardless of who started the conversation. */
export const directKeyOf = (a: string, b: string): string => [a, b].map(String).sort().join(':');

const chatChannelSchema = new Schema<IChatChannel>({
  workspace: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
  kind: { type: String, enum: CHANNEL_KINDS, required: true },
  name: { type: String, required: true, trim: true, minlength: 1, maxlength: MAX_CHANNEL_NAME },
  nameKey: { type: String, required: true },
  project: { type: Schema.Types.ObjectId, ref: 'Project', default: null },
  participants: { type: [Schema.Types.ObjectId], ref: 'User', default: [] },
  directKey: { type: String, default: null },
  archived: { type: Boolean, default: false },
  lastMessageAt: { type: Date, default: null },
  lastMessageAuthor: { type: Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

chatChannelSchema.pre('validate', function () {
  this.nameKey = (this.name ?? '').trim().toLowerCase();
  if (this.kind === 'direct') {
    const ids = (this.participants ?? []).map(String);
    this.directKey = ids.length === MAX_DIRECT_PARTICIPANTS ? directKeyOf(ids[0], ids[1]) : null;
  } else {
    this.directKey = null;
  }
});

// Named channels: one per name, kind and workspace
chatChannelSchema.index(
  { workspace: 1, kind: 1, nameKey: 1 },
  { unique: true, partialFilterExpression: { kind: { $in: ['team', 'general', 'project'] } } },
);
// Exactly one channel per project
chatChannelSchema.index(
  { workspace: 1, project: 1 },
  { unique: true, partialFilterExpression: { project: { $type: 'objectId' } } },
);
// Exactly one direct channel per participant pair
chatChannelSchema.index(
  { workspace: 1, directKey: 1 },
  { unique: true, partialFilterExpression: { directKey: { $type: 'string' } } },
);
chatChannelSchema.index({ workspace: 1, kind: 1, lastMessageAt: -1 });

const ChatChannel = mongoose.model<IChatChannel>('ChatChannel', chatChannelSchema);
export default ChatChannel;
