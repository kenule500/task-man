import mongoose, { Document, Schema } from 'mongoose';

export const CHANNEL_TYPES = ['team', 'project', 'dm'] as const;
export type ChannelType = (typeof CHANNEL_TYPES)[number];

export const MAX_CHANNEL_NAME = 60;
export const GENERAL_SLUG = 'general';

export interface IChatChannel extends Document {
  workspace: mongoose.Types.ObjectId;
  name: string;
  // Unique per workspace; "general" is the default team channel
  slug: string;
  type: ChannelType;
  // Project channels: the project's name (tasks reference projects by name)
  project?: string;
  // Direct messages and private channels: who can read; empty for everyone else
  members: mongoose.Types.ObjectId[];
  private: boolean;
  // Direct messages: the two member ids, sorted and joined, so a pair has one conversation
  dmKey?: string;
  createdBy?: mongoose.Types.ObjectId;
  lastMessageAt?: Date | null;
  archived: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const chatChannelSchema = new Schema<IChatChannel>({
  workspace: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
  name: { type: String, required: true, trim: true, minlength: 1, maxlength: MAX_CHANNEL_NAME },
  slug: { type: String, required: true, trim: true, maxlength: 80 },
  type: { type: String, enum: CHANNEL_TYPES, required: true },
  project: { type: String, trim: true, maxlength: 60 },
  members: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  private: { type: Boolean, default: false },
  dmKey: { type: String, maxlength: 60 },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  lastMessageAt: { type: Date, default: null },
  archived: { type: Boolean, default: false },
}, { timestamps: true });

chatChannelSchema.index({ workspace: 1, slug: 1 }, { unique: true });
chatChannelSchema.index({ workspace: 1, dmKey: 1 }, { unique: true, partialFilterExpression: { dmKey: { $type: 'string' } } });
chatChannelSchema.index({ workspace: 1, project: 1 }, { unique: true, partialFilterExpression: { type: 'project' } });

const ChatChannel = mongoose.model<IChatChannel>('ChatChannel', chatChannelSchema);
export default ChatChannel;
