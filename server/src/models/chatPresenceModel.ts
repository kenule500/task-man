import mongoose, { Document, Schema } from 'mongoose';

// Presence is refreshed while any socket of the user is open; an unclean disconnect ages out through the TTL
export const CHAT_PRESENCE_TTL_SECONDS = 90;

export interface IChatPresence extends Document {
  workspace: mongoose.Types.ObjectId;
  user: mongoose.Types.ObjectId;
  // One user with several tabs or devices is still one presence
  connections: number;
  seenAt: Date;
}

const chatPresenceSchema = new Schema<IChatPresence>({
  workspace: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  connections: { type: Number, default: 0, min: 0 },
  seenAt: { type: Date, default: Date.now },
}, { versionKey: false, timestamps: false });

chatPresenceSchema.index({ workspace: 1, user: 1 }, { unique: true });
chatPresenceSchema.index({ seenAt: 1 }, { expireAfterSeconds: CHAT_PRESENCE_TTL_SECONDS });

const ChatPresence = mongoose.model<IChatPresence>('ChatPresence', chatPresenceSchema);
export default ChatPresence;
