import mongoose, { Document, Schema } from 'mongoose';

/**
 * A pending second step of a sign-in: created after the password was right, consumed by the code.
 * Only the hash of the nonce is stored; MongoDB deletes expired rows (TTL index).
 */
export interface ITwoFactorChallenge extends Document {
  user: mongoose.Types.ObjectId;
  nonceHash: string;
  /** Wrong codes so far; the challenge is deleted at the limit */
  attempts: number;
  expiresAt: Date;
}

const twoFactorChallengeSchema: Schema = new Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  nonceHash: { type: String, required: true, unique: true },
  attempts: { type: Number, default: 0 },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
});

const TwoFactorChallenge = mongoose.model<ITwoFactorChallenge>('TwoFactorChallenge', twoFactorChallengeSchema);
export default TwoFactorChallenge;
