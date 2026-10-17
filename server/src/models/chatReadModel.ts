import mongoose, { Document, Schema } from 'mongoose';

export interface IChatRead extends Document {
  workspace: mongoose.Types.ObjectId;
  channel: mongoose.Types.ObjectId;
  user: mongoose.Types.ObjectId;
  lastReadAt: Date;
  lastReadMessage?: mongoose.Types.ObjectId | null;
}

const chatReadSchema = new Schema<IChatRead>({
  workspace: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
  channel: { type: Schema.Types.ObjectId, ref: 'ChatChannel', required: true },
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  lastReadAt: { type: Date, default: Date.now },
  lastReadMessage: { type: Schema.Types.ObjectId, ref: 'ChatMessage', default: null },
}, { versionKey: false, timestamps: false });

// One read pointer per person and channel
chatReadSchema.index({ channel: 1, user: 1 }, { unique: true });
chatReadSchema.index({ workspace: 1, user: 1 });

const ChatRead = mongoose.model<IChatRead>('ChatRead', chatReadSchema);
export default ChatRead;
