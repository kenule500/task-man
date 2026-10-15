import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import User, { IUser } from '../models/userModel.js';
import TwoFactorChallenge from '../models/twoFactorChallengeModel.js';
import { decryptSecret, encryptSecret } from '../utils/secretBox.js';
import { generateRecoveryCodes, hashRecoveryCodes } from '../utils/recoveryCodes.js';
import { buildOtpauthUrl, generateTotpSecret, verifyTotp } from '../utils/totp.js';
import { hashToken } from '../utils/tokens.js';
import {
  MAX_CHALLENGE_ATTEMPTS,
  TWO_FACTOR_ISSUER,
  loadUserWithSecrets,
  readChallenge,
  requiredByAnyWorkspace,
  secretContext,
  verifySecondFactor,
} from '../utils/twoFactor.js';
import { issueSession } from './authController.js';

const serverError = (res: Response, context: string, error: unknown): void => {
  console.error(`${context} error:`, error);
  res.status(500).json({ message: 'Server error' });
};

const asText = (value: unknown): string => (typeof value === 'string' ? value : '');

/** Sends the response for a failed second-factor check. */
const rejectSecondFactor = (res: Response, reason: 'invalid' | 'locked' | 'missing'): void => {
  if (reason === 'locked') {
    res.status(429).json({ message: 'Too many wrong codes. Wait 15 minutes and try again.', code: 'TWO_FACTOR_LOCKED' });
  } else if (reason === 'missing') {
    res.status(400).json({ message: 'Enter a code from your authenticator app or a recovery code.', code: 'CODE_REQUIRED' });
  } else {
    res.status(400).json({ message: 'That code is not valid. Check the time on your phone and try the newest code.', code: 'INVALID_CODE' });
  }
};

/**
 * Loads the signed-in user with the secrets and checks the password (sensitive actions repeat it).
 * Wrong passwords answer 400, not 401, which the web app treats as an expired session.
 */
const loadAuthorizedUser = async (req: Request, res: Response): Promise<IUser | null> => {
  const user = await loadUserWithSecrets(req.user?._id);
  if (!user) {
    res.status(404).json({ message: 'User not found' });
    return null;
  }
  const password = asText(req.body?.password);
  if (!password || !(await bcrypt.compare(password, user.password))) {
    res.status(400).json({ message: 'Your password is not correct.', code: 'INVALID_PASSWORD' });
    return null;
  }
  return user;
};

// ================================================================
// @desc    Two-factor status of the signed-in user
// @route   GET /api/profile/2fa
// ================================================================
export const getTwoFactorStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await loadUserWithSecrets(req.user?._id);
    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }
    res.status(200).json({
      enabled: Boolean(user.twoFactor?.enabled),
      enabledAt: user.twoFactor?.enabledAt ?? null,
      recoveryCodesRemaining: user.twoFactor?.recoveryCodeHashes?.length ?? 0,
    });
  } catch (error) {
    serverError(res, 'getTwoFactorStatus', error);
  }
};

// ================================================================
// @desc    Start enabling: generate a secret and keep it pending until a code proves the app has it
// @route   POST /api/profile/2fa/setup
// ================================================================
export const setupTwoFactor = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await loadUserWithSecrets(req.user?._id);
    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }
    if (user.twoFactor?.enabled) {
      res.status(409).json({ message: 'Two-factor authentication is already on.', code: 'ALREADY_ENABLED' });
      return;
    }

    const secret = generateTotpSecret();
    await User.updateOne(
      { _id: user._id },
      { $set: { 'twoFactor.pendingSecretEncrypted': encryptSecret(secret, secretContext(user)) } },
    );
    res.status(200).json({ secret, otpauthUrl: buildOtpauthUrl(secret, user.email, TWO_FACTOR_ISSUER) });
  } catch (error) {
    serverError(res, 'setupTwoFactor', error);
  }
};

// ================================================================
// @desc    Finish enabling with a code from the app; returns the recovery codes once
// @route   POST /api/profile/2fa/enable   { code, password }
// ================================================================
export const enableTwoFactor = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await loadAuthorizedUser(req, res);
    if (!user) return;
    if (user.twoFactor?.enabled) {
      res.status(409).json({ message: 'Two-factor authentication is already on.', code: 'ALREADY_ENABLED' });
      return;
    }
    const pending = user.twoFactor?.pendingSecretEncrypted;
    if (!pending) {
      res.status(400).json({ message: 'Start the setup first.', code: 'SETUP_REQUIRED' });
      return;
    }

    let step: number | null = null;
    try {
      step = verifyTotp(decryptSecret(pending, secretContext(user)), asText(req.body?.code));
    } catch {
      step = null;
    }
    if (step === null) {
      rejectSecondFactor(res, asText(req.body?.code) ? 'invalid' : 'missing');
      return;
    }

    const recoveryCodes = generateRecoveryCodes();
    const enabled = await User.updateOne(
      { _id: user._id, 'twoFactor.enabled': { $ne: true }, 'twoFactor.pendingSecretEncrypted': pending },
      {
        $set: {
          'twoFactor.enabled': true,
          'twoFactor.secretEncrypted': pending,
          'twoFactor.recoveryCodeHashes': await hashRecoveryCodes(recoveryCodes),
          'twoFactor.enabledAt': new Date(),
          // The code that proved the setup cannot be used again to sign in
          'twoFactor.lastUsedStep': step,
          'twoFactor.failedAttempts': 0,
        },
        $unset: { 'twoFactor.pendingSecretEncrypted': '', 'twoFactor.lockedUntil': '' },
      },
    );
    if (enabled.modifiedCount !== 1) {
      res.status(409).json({ message: 'Setup changed in another tab. Start again.', code: 'SETUP_REQUIRED' });
      return;
    }
    res.status(200).json({ enabled: true, recoveryCodes });
  } catch (error) {
    serverError(res, 'enableTwoFactor', error);
  }
};

// ================================================================
// @desc    Turn two-factor off (password plus a code or a recovery code)
// @route   POST /api/profile/2fa/disable   { password, code | recoveryCode }
// ================================================================
export const disableTwoFactor = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await loadAuthorizedUser(req, res);
    if (!user) return;
    if (!user.twoFactor?.enabled) {
      res.status(400).json({ message: 'Two-factor authentication is not on.', code: 'NOT_ENABLED' });
      return;
    }
    // Leaving would lock the person out of that workspace, and out of its settings
    if (await requiredByAnyWorkspace(user._id)) {
      res.status(409).json({
        message: 'A workspace you belong to requires two-factor authentication. Ask an admin to turn that policy off first.',
        code: 'TWO_FACTOR_REQUIRED_BY_WORKSPACE',
      });
      return;
    }

    const result = await verifySecondFactor(user, req.body ?? {});
    if (!result.ok) {
      rejectSecondFactor(res, result.reason);
      return;
    }

    await User.updateOne(
      { _id: user._id },
      {
        $set: { 'twoFactor.enabled': false, 'twoFactor.failedAttempts': 0 },
        $unset: {
          'twoFactor.secretEncrypted': '',
          'twoFactor.pendingSecretEncrypted': '',
          'twoFactor.recoveryCodeHashes': '',
          'twoFactor.enabledAt': '',
          'twoFactor.lastUsedStep': '',
          'twoFactor.lockedUntil': '',
        },
      },
    );
    await TwoFactorChallenge.deleteMany({ user: user._id });
    res.status(200).json({ enabled: false });
  } catch (error) {
    serverError(res, 'disableTwoFactor', error);
  }
};

// ================================================================
// @desc    Replace the recovery codes (old ones stop working)
// @route   POST /api/profile/2fa/recovery-codes   { password, code }
// ================================================================
export const regenerateRecoveryCodes = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await loadAuthorizedUser(req, res);
    if (!user) return;
    if (!user.twoFactor?.enabled) {
      res.status(400).json({ message: 'Two-factor authentication is not on.', code: 'NOT_ENABLED' });
      return;
    }
    // An authenticator code only: a recovery code would be spent to make new ones
    const result = await verifySecondFactor(user, { code: req.body?.code });
    if (!result.ok) {
      rejectSecondFactor(res, result.reason);
      return;
    }

    const recoveryCodes = generateRecoveryCodes();
    await User.updateOne(
      { _id: user._id },
      { $set: { 'twoFactor.recoveryCodeHashes': await hashRecoveryCodes(recoveryCodes) } },
    );
    res.status(200).json({ recoveryCodes });
  } catch (error) {
    serverError(res, 'regenerateRecoveryCodes', error);
  }
};

// ================================================================
// @desc    Second step of sign-in: challenge + code (or recovery code) -> session
// @route   POST /api/auth/login/2fa   { challenge, code | recoveryCode }
// ================================================================
export const completeTwoFactorLogin = async (req: Request, res: Response): Promise<void> => {
  try {
    const expired = () => res.status(401).json({
      message: 'This sign-in expired. Enter your email and password again.',
      code: 'CHALLENGE_EXPIRED',
    });

    const claims = readChallenge(asText(req.body?.challenge));
    if (!claims) {
      expired();
      return;
    }
    const challenge = await TwoFactorChallenge.findOne({
      user: claims.id,
      nonceHash: hashToken(claims.nonce),
      expiresAt: { $gt: new Date() },
    });
    if (!challenge) {
      expired();
      return;
    }

    const user = await loadUserWithSecrets(claims.id);
    if (!user?.twoFactor?.enabled || !user.isVerified) {
      await challenge.deleteOne();
      expired();
      return;
    }

    const result = await verifySecondFactor(user, req.body ?? {});
    if (!result.ok) {
      if (result.reason === 'invalid') {
        const updated = await TwoFactorChallenge.findOneAndUpdate(
          { _id: challenge._id },
          { $inc: { attempts: 1 } },
          { returnDocument: 'after' },
        );
        if (!updated || updated.attempts >= MAX_CHALLENGE_ATTEMPTS) {
          await TwoFactorChallenge.deleteOne({ _id: challenge._id });
          res.status(401).json({
            message: 'Too many wrong codes. Enter your email and password again.',
            code: 'CHALLENGE_LOCKED',
          });
          return;
        }
        res.status(401).json({
          message: 'That code is not valid. Check the time on your phone and try the newest code.',
          code: 'INVALID_CODE',
          attemptsLeft: MAX_CHALLENGE_ATTEMPTS - updated.attempts,
        });
        return;
      }
      if (result.reason === 'locked') {
        res.status(429).json({ message: 'Too many wrong codes. Wait 15 minutes and try again.', code: 'TWO_FACTOR_LOCKED' });
        return;
      }
      res.status(400).json({ message: 'Enter a code from your authenticator app or a recovery code.', code: 'CODE_REQUIRED' });
      return;
    }

    // Single use: whoever deletes the challenge completes the sign-in
    const consumed = await TwoFactorChallenge.findOneAndDelete({ _id: challenge._id });
    if (!consumed) {
      expired();
      return;
    }

    res.json({
      ...(await issueSession(user, req)),
      usedRecoveryCode: result.method === 'recovery',
      recoveryCodesRemaining: result.method === 'recovery'
        ? Math.max(0, (user.twoFactor.recoveryCodeHashes?.length ?? 1) - 1)
        : undefined,
    });
  } catch (error) {
    serverError(res, 'completeTwoFactorLogin', error);
  }
};
