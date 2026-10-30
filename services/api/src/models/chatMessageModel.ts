import mongoose, { Document, Schema } from 'mongoose';

export const MAX_MESSAGE_LENGTH = 4000;

export interface IChatMessage extends Document {
  workspace: mongoose.Types.ObjectId;
  channel: mongoose.Types.ObjectId;
  author: mongoose.Types.ObjectId;
  // Plain text only; clients render it as text. Cleared when the message is deleted
  text: string;
  mentions: mongoose.Types.ObjectId[];
  editedAt?: Date | null;
  deletedAt?: Date | null;
  createdAt: Date;
}

const chatMessageSchema = new Schema<IChatMessage>({
  workspace: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
  channel: { type: Schema.Types.ObjectId, ref: 'ChatChannel', required: true },
  author: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  text: { type: String, required: true, minlength: 1, maxlength: MAX_MESSAGE_LENGTH },
  mentions: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  editedAt: { type: Date, default: null },
  deletedAt: { type: Date, default: null },
}, { timestamps: { createdAt: true, updatedAt: false } });

chatMessageSchema.index({ channel: 1, createdAt: 1 });

const ChatMessage = mongoose.model<IChatMessage>('ChatMessage', chatMessageSchema);
export default ChatMessage;
