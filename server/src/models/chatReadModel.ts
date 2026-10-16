import mongoose, { Document, Schema } from 'mongoose';

// How far a member has read a channel; unread = messages from others after lastReadAt
export interface IChatRead extends Document {
  workspace: mongoose.Types.ObjectId;
  user: mongoose.Types.ObjectId;
  channel: mongoose.Types.ObjectId;
  lastReadAt: Date;
}

const chatReadSchema = new Schema<IChatRead>({
  workspace: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  channel: { type: Schema.Types.ObjectId, ref: 'ChatChannel', required: true },
  lastReadAt: { type: Date, required: true },
}, { versionKey: false });

chatReadSchema.index({ user: 1, channel: 1 }, { unique: true });
chatReadSchema.index({ workspace: 1, user: 1 });

const ChatRead = mongoose.model<IChatRead>('ChatRead', chatReadSchema);
export default ChatRead;
