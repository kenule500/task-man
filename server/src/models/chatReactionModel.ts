import mongoose, { Document, Schema } from 'mongoose';

export const MAX_EMOJI_LENGTH = 32;

export interface IChatReaction extends Document {
  workspace: mongoose.Types.ObjectId;
  message: mongoose.Types.ObjectId;
  user: mongoose.Types.ObjectId;
  emoji: string;
  createdAt: Date;
}

const chatReactionSchema = new Schema<IChatReaction>({
  workspace: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
  message: { type: Schema.Types.ObjectId, ref: 'ChatMessage', required: true },
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  emoji: { type: String, required: true, maxlength: MAX_EMOJI_LENGTH },
}, { timestamps: { createdAt: true, updatedAt: false } });

// A reaction is a toggle keyed by this triple, so one user holds at most one of each emoji per message
chatReactionSchema.index({ message: 1, user: 1, emoji: 1 }, { unique: true });
chatReactionSchema.index({ workspace: 1, message: 1 });

const ChatReaction = mongoose.model<IChatReaction>('ChatReaction', chatReactionSchema);
export default ChatReaction;
