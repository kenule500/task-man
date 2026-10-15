import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import User, { IUser } from '../models/userModel.js';
import TwoFactorChallenge from '../models/twoFactorChallengeModel.js';
import Workspace from '../models/workspaceModel.js';
import { getConfig } from '../config/env.js';
import { decryptSecret } from './secretBox.js';
import { findRecoveryCodeHash } from './recoveryCodes.js';
import { hashToken } from './tokens.js';
import { verifyTotp } from './totp.js';

export const CHALLENGE_TTL_SECONDS = 5 * 60;
/** Wrong codes allowed on one sign-in challenge */
export const MAX_CHALLENGE_ATTEMPTS = 5;
/** Consecutive wrong codes on the account (across challenges) before second-step attempts pause */
export const MAX_FAILED_ATTEMPTS = 5;
export const LOCK_MS = 15 * 60 * 1000;
export const TWO_FACTOR_ISSUER = 'TaskMan';

/** `select` for loading the encrypted material together with the user. */
export const TWO_FACTOR_SECRET_FIELDS =
  '+twoFactor.secretEncrypted +twoFactor.pendingSecretEncrypted +twoFactor.recoveryCodeHashes';

/** Loads a user including the two-factor secrets (the password hash is included too, as in any default query). */
export const loadUserWithSecrets = (userId: unknown) => User.findById(userId).select(TWO_FACTOR_SECRET_FIELDS);

export const secretContext = (user: Pick<IUser, '_id'>): string => String(user._id);

// ------------------------------------------------------------
// Sign-in challenge (a signed token bound to a stored, single-use nonce)
// ------------------------------------------------------------

/** Separate signing key from session tokens, so a challenge can never be mistaken for one. */
const challengeKey = (): string =>
  crypto.createHmac('sha256', getConfig().jwtSecret).update('taskman/two-factor/challenge/v1').digest('hex');

export const createChallenge = async (userId: mongoose.Types.ObjectId | string): Promise<string> => {
  const nonce = crypto.randomBytes(24).toString('hex');
  // One open challenge per account: starting a new sign-in replaces the previous one
  await TwoFactorChallenge.deleteMany({ user: userId });
  await TwoFactorChallenge.create({
    user: userId,
    nonceHash: hashToken(nonce),
    expiresAt: new Date(Date.now() + CHALLENGE_TTL_SECONDS * 1000),
  });
  return jwt.sign({ id: String(userId), purpose: '2fa', nonce }, challengeKey(), { expiresIn: CHALLENGE_TTL_SECONDS });
};

export const readChallenge = (challenge: string): { id: string; nonce: string } | null => {
  try {
    const decoded = jwt.verify(challenge, challengeKey()) as { id?: unknown; purpose?: unknown; nonce?: unknown };
    if (decoded.purpose !== '2fa' || typeof decoded.id !== 'string' || typeof decoded.nonce !== 'string') return null;
    return { id: decoded.id, nonce: decoded.nonce };
  } catch {
    return null;
  }
};

// ------------------------------------------------------------
// Verifying a code or a recovery code
// ------------------------------------------------------------
export type SecondFactorResult =
  | { ok: true; method: 'totp' | 'recovery' }
  | { ok: false; reason: 'invalid' | 'locked' | 'missing' };

export const isLocked = (user: IUser): boolean => Boolean(user.twoFactor?.lockedUntil && user.twoFactor.lockedUntil.getTime() > Date.now());

const registerFailure = async (user: IUser): Promise<void> => {
  const updated = await User.findOneAndUpdate(
    { _id: user._id },
    { $inc: { 'twoFactor.failedAttempts': 1 } },
    { returnDocument: 'after' },
  ) as IUser | null;
  if ((updated?.twoFactor?.failedAttempts ?? 0) >= MAX_FAILED_ATTEMPTS) {
    await User.updateOne(
      { _id: user._id },
      { $set: { 'twoFactor.lockedUntil': new Date(Date.now() + LOCK_MS), 'twoFactor.failedAttempts': 0 } },
    );
  }
};

/**
 * Checks an authenticator code or a recovery code for a user loaded with the secrets.
 * An authenticator code is accepted once (its time step must be newer than the last accepted one);
 * a recovery code is removed as it is used. Both updates are conditional writes, so two parallel
 * requests cannot both succeed. Repeated failures pause attempts for LOCK_MS.
 */
export const verifySecondFactor = async (
  user: IUser,
  input: { code?: unknown; recoveryCode?: unknown },
): Promise<SecondFactorResult> => {
  const secretEncrypted = user.twoFactor?.secretEncrypted;
  if (!user.twoFactor?.enabled || !secretEncrypted) return { ok: false, reason: 'missing' };
  if (isLocked(user)) return { ok: false, reason: 'locked' };

  const clearFailures = { $set: { 'twoFactor.failedAttempts': 0 }, $unset: { 'twoFactor.lockedUntil': '' } };

  // Both proofs are always checked, in order; each check rejects empty or malformed input by itself,
  // so what the request contains never decides whether verification runs.
  const code = typeof input.code === 'string' ? input.code : '';
  const recoveryCode = typeof input.recoveryCode === 'string' ? input.recoveryCode : '';

  let secret: string | null = null;
  try {
    secret = decryptSecret(secretEncrypted, secretContext(user));
  } catch {
    secret = null;
  }
  const step = secret === null ? null : verifyTotp(secret, code, { lastUsedStep: user.twoFactor.lastUsedStep });
  if (step !== null) {
    const claimed = await User.updateOne(
      {
        _id: user._id,
        $or: [
          { 'twoFactor.lastUsedStep': { $exists: false } },
          { 'twoFactor.lastUsedStep': null },
          { 'twoFactor.lastUsedStep': { $lt: step } },
        ],
      },
      { ...clearFailures, $max: { 'twoFactor.lastUsedStep': step } },
    );
    if (claimed.modifiedCount === 1) return { ok: true, method: 'totp' };
  }

  // A 6-digit authenticator code is never a valid recovery code (8 characters), so this only matches real ones
  const hash = await findRecoveryCodeHash(recoveryCode, user.twoFactor.recoveryCodeHashes ?? []);
  if (hash) {
    const used = await User.updateOne(
      { _id: user._id, 'twoFactor.recoveryCodeHashes': hash },
      { $pull: { 'twoFactor.recoveryCodeHashes': hash }, ...clearFailures },
    );
    if (used.modifiedCount === 1) return { ok: true, method: 'recovery' };
  }

  if (!code.trim() && !recoveryCode.trim()) return { ok: false, reason: 'missing' };
  await registerFailure(user);
  return { ok: false, reason: 'invalid' };
};

/** True when any workspace the user belongs to requires two-factor authentication. */
export const requiredByAnyWorkspace = async (userId: unknown): Promise<boolean> =>
  Boolean(await Workspace.exists({
    'members.user': new mongoose.Types.ObjectId(String(userId)),
    'security.require2fa': true,
  }));
