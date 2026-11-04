import mongoose, { Document, Schema } from 'mongoose';

// Online status: one row per person, workspace and server instance, refreshed by the socket server's
// heartbeat. MongoDB removes stale rows (an instance that died) after the TTL.
export const CHAT_PRESENCE_TTL_SECONDS = 90;

export interface IChatPresence extends Document {
  workspace: mongoose.Types.ObjectId;
  user: mongoose.Types.ObjectId;
  // Which server instance holds the sockets (several can serve one person)
  instance: string;
  socketCount: number;
  lastSeenAt: Date;
}

const chatPresenceSchema = new Schema<IChatPresence>({
  workspace: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  instance: { type: String, required: true, maxlength: 64 },
  socketCount: { type: Number, default: 0 },
  lastSeenAt: { type: Date, default: Date.now },
}, { versionKey: false });

chatPresenceSchema.index({ workspace: 1, user: 1, instance: 1 }, { unique: true });
chatPresenceSchema.index({ lastSeenAt: 1 }, { expireAfterSeconds: CHAT_PRESENCE_TTL_SECONDS });

const ChatPresence = mongoose.model<IChatPresence>('ChatPresence', chatPresenceSchema);
export default ChatPresence;
