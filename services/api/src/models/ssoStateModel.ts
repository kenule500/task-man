import mongoose, { Document, Schema } from 'mongoose';

/**
 * One pending single sign-on attempt: created by /start, consumed (deleted) by /callback.
 * Only the hash of `state` is stored; the PKCE verifier and nonce are needed to finish the exchange.
 * MongoDB deletes expired rows (TTL index).
 */
export interface ISsoState extends Document {
  stateHash: string;
  provider: 'google' | 'microsoft';
  codeVerifier: string;
  nonce: string;
  /** Relative app path to continue to after sign-in (validated when it was stored) */
  redirect?: string;
  expiresAt: Date;
}

export const SSO_STATE_TTL_MS = 10 * 60 * 1000;

const ssoStateSchema: Schema = new Schema({
  stateHash: { type: String, required: true, unique: true },
  provider: { type: String, enum: ['google', 'microsoft'], required: true },
  codeVerifier: { type: String, required: true },
  nonce: { type: String, required: true },
  redirect: { type: String, maxlength: 300 },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
});

const SsoState = mongoose.model<ISsoState>('SsoState', ssoStateSchema);
export default SsoState;
