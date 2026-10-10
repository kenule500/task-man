import mongoose, { Document, Schema } from 'mongoose';
import { MAX_TOKEN_NAME } from '../utils/apiTokens.js';

export interface IApiToken extends Document {
  workspace: mongoose.Types.ObjectId;
  user: mongoose.Types.ObjectId;
  name: string;
  // First characters after "tm_", for display; the token itself is never stored
  prefix: string;
  // SHA-256 hex digest of the whole token
  tokenHash: string;
  // Permission keys; the token can never do more than its owner's role allows at request time
  scopes: string[];
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const apiTokenSchema = new Schema<IApiToken>({
  workspace: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true, trim: true, minlength: 1, maxlength: MAX_TOKEN_NAME },
  prefix: { type: String, required: true, maxlength: 12 },
  tokenHash: { type: String, required: true, unique: true, select: false },
  scopes: { type: [String], default: [] },
  expiresAt: { type: Date, default: null },
  lastUsedAt: { type: Date, default: null },
  revokedAt: { type: Date, default: null },
}, { timestamps: true });

apiTokenSchema.index({ workspace: 1, user: 1, createdAt: -1 });

const ApiToken = mongoose.model<IApiToken>('ApiToken', apiTokenSchema);
export default ApiToken;
