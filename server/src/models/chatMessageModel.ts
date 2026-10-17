import mongoose, { Document, Schema } from 'mongoose';

export const MAX_MESSAGE_BODY = 4000;

export interface ChatAttachment {
  // GridFS file id
  id: string;
  name: string;
  size: number;
  type: string;
}

export interface IChatMessage extends Document {
  workspace: mongoose.Types.ObjectId;
  channel: mongoose.Types.ObjectId;
  author: mongoose.Types.ObjectId;
  body: string;
  // Set on a threaded reply
  parent?: mongoose.Types.ObjectId | null;
  mentions: mongoose.Types.ObjectId[];
  attachments: ChatAttachment[];
  // Denormalised onto the parent so a channel does not need to count replies per render
  replyCount: number;
  lastReplyAuthor?: mongoose.Types.ObjectId | null;
  editedAt?: Date | null;
  // Soft delete: the row survives so ordering and replies stay intact
  deletedAt?: Date | null;
  pinnedAt?: Date | null;
  pinnedBy?: mongoose.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const attachmentSchema = new Schema<ChatAttachment>({
  id: { type: String, required: true },
  name: { type: String, required: true, maxlength: 255 },
  size: { type: Number, default: 0 },
  type: { type: String, default: 'application/octet-stream', maxlength: 120 },
}, { _id: false });

const chatMessageSchema = new Schema<IChatMessage>({
  workspace: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
  channel: { type: Schema.Types.ObjectId, ref: 'ChatChannel', required: true },
  author: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  body: { type: String, default: '', trim: true, maxlength: MAX_MESSAGE_BODY },
  parent: { type: Schema.Types.ObjectId, ref: 'ChatMessage', default: null },
  mentions: { type: [Schema.Types.ObjectId], ref: 'User', default: [] },
  attachments: { type: [attachmentSchema], default: [] },
  replyCount: { type: Number, default: 0 },
  lastReplyAuthor: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  editedAt: { type: Date, default: null },
  deletedAt: { type: Date, default: null },
  pinnedAt: { type: Date, default: null },
  pinnedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

// The cursor predicate "<createdAt, _id> older than" is a range scan on this index
chatMessageSchema.index({ channel: 1, createdAt: -1, _id: -1 });
chatMessageSchema.index({ channel: 1, parent: 1, createdAt: 1 });
chatMessageSchema.index({ channel: 1, pinnedAt: -1 });
chatMessageSchema.index({ workspace: 1, createdAt: -1 });

const ChatMessage = mongoose.model<IChatMessage>('ChatMessage', chatMessageSchema);
export default ChatMessage;
