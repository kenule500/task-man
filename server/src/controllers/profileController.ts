import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import User from '../models/userModel.js';
import Session, { SESSION_LIFETIME_MS } from '../models/sessionModel.js';
import mongoose from 'mongoose';

// ================================================================
// Local helpers
// (kept inline so this controller doesn't depend on helpers that
// may or may not exist in the merged codebase)
// ================================================================

/** Extract + validate userId from req.user. Sends 401 if missing. */
const requireUserId = (req: Request, res: Response): string | null => {
  const userId = (req as { user?: { _id?: string } }).user?._id;
  if (!userId) {
    res.status(401).json({ message: 'Not authorized' });
    return null;
  }
  return userId;
};

/** Standard 500 response with a consistent error log. */
const sendServerError = (res: Response, context: string, error: unknown): void => {
  console.error(`${context} error:`, error);
  res.status(500).json({ message: 'Server error' });
};

/** Fields that must never be sent to the client. */
const USER_PRIVATE_FIELDS =
  '-password -verificationToken -verificationTokenExpires -resetPasswordToken -resetPasswordExpires';

// Sessions store SHA-256 token hashes: use the shared helpers so "keep the
// current session" matches (a local identity hash signed everyone out).
import { getBearerToken, hashToken } from '../utils/tokens.js';
import { MIN_PASSWORD_LENGTH } from './authController.js';

/** Maximum lengths of the editable profile fields. */
const PROFILE_FIELD_LIMITS: Record<string, number> = {
  name: 80, avatarUrl: 500, bio: 280, jobTitle: 80, phone: 30, timezone: 64, language: 10, theme: 10,
};

// ================================================================
// @desc    Get current user's profile
// @route   GET /api/profile
// ================================================================
export const getProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const user = await User.findById(userId)
      .select(USER_PRIVATE_FIELDS)
      .populate('workspaces', 'name slug');

    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    res.status(200).json(user);
  } catch (error) {
    sendServerError(res, 'getProfile', error);
  }
};

// ================================================================
// @desc    Update current user's profile
// @route   PUT /api/profile
// ================================================================
export const updateProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const allowedFields = [
      'name', 'avatarUrl', 'bio', 'jobTitle', 'phone',
      'timezone', 'language', 'theme',
    ];

    const updates: Record<string, unknown> = {};
    for (const field of allowedFields) {
      const value = req.body[field];
      if (value === undefined) continue;
      // Strings only (objects would reach the update as operators or cast errors)
      if (typeof value !== 'string' || value.length > (PROFILE_FIELD_LIMITS[field] ?? 280)) {
        res.status(400).json({ message: `Invalid ${field}` });
        return;
      }
      updates[field] = value.trim();
    }
    if (updates.theme !== undefined && !['light', 'dark', 'system'].includes(updates.theme as string)) {
      res.status(400).json({ message: 'Theme must be light, dark or system' });
      return;
    }
    // Rendered as an <img src>: only http(s) URLs (no javascript:/data: payloads)
    if (typeof updates.avatarUrl === 'string' && updates.avatarUrl && !/^https?:\/\/\S+$/i.test(updates.avatarUrl)) {
      res.status(400).json({ message: 'Avatar URL must start with http:// or https://' });
      return;
    }

    const user = await User.findByIdAndUpdate(userId, updates, {
      returnDocument: 'after',
      runValidators: true,
    }).select(USER_PRIVATE_FIELDS);

    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    res.status(200).json(user);
  } catch (error) {
    sendServerError(res, 'updateProfile', error);
  }
};

// ================================================================
// @desc    Update notification preferences
// @route   PUT /api/profile/notifications
// ================================================================
export const updateNotifications = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = requireUserId(req, res);
    if (!userId) return;

    // Update only the provided switches, and only with real booleans
    const keys = ['email', 'taskAssigned', 'taskCompleted', 'weeklyDigest', 'push'] as const;
    const updates: Record<string, boolean> = {};
    for (const key of keys) {
      const value = req.body[key];
      if (value === undefined) continue;
      if (typeof value !== 'boolean') {
        res.status(400).json({ message: `${key} must be true or false` });
        return;
      }
      updates[`notifications.${key}`] = value;
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { $set: updates },
      { returnDocument: 'after', runValidators: true }
    ).select(USER_PRIVATE_FIELDS);

    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    res.status(200).json(user);
  } catch (error) {
    sendServerError(res, 'updateNotifications', error);
  }
};

// ================================================================
// @desc    Change password
// @route   PUT /api/profile/password
// ================================================================
export const changePassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const { currentPassword, newPassword } = req.body;

    if (
      typeof currentPassword !== 'string' ||
      typeof newPassword !== 'string' ||
      !currentPassword ||
      !newPassword
    ) {
      res.status(400).json({ message: 'Current and new password are required' });
      return;
    }
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      res.status(400).json({
        message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
      });
      return;
    }

    const user = await User.findById(userId);
    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    const matches = await bcrypt.compare(currentPassword, user.password);
    if (!matches) {
      res.status(401).json({ message: 'Current password is incorrect' });
      return;
    }

    user.password = newPassword;
    await user.save();

    // Sign out every other device; keep the session making this request
    const currentToken = getBearerToken(req.headers.authorization);
    await Session.updateMany(
      {
        user: user._id,
        ...(currentToken && { token: { $ne: hashToken(currentToken) } }),
      },
      { isValid: false }
    );

    res.status(200).json({ message: 'Password updated successfully' });
  } catch (error) {
    sendServerError(res, 'changePassword', error);
  }
};
// ================================================================
// Sessions (signed-in devices)
// ================================================================

/** Sessions that can still be used: not revoked and whose 1-hour access token has not expired. */
const activeSessionFilter = (userId: mongoose.Types.ObjectId | undefined) => ({
  user: userId,
  isValid: true,
  createdAt: { $gt: new Date(Date.now() - SESSION_LIFETIME_MS) },
});

/**
 * @desc    Devices signed in to this account, current one first
 * @route   GET /api/profile/sessions
 */
export const listSessions = async (req: Request, res: Response): Promise<void> => {
  try {
    const currentToken = getBearerToken(req.headers.authorization);
    const currentHash = currentToken ? hashToken(currentToken) : null;
    const sessions = await Session.find(activeSessionFilter(req.user?._id as mongoose.Types.ObjectId | undefined))
      .sort({ createdAt: -1 })
      .select('token userAgent ipAddress createdAt lastLoggedIn')
      .lean();

    res.status(200).json(sessions
      .map(session => ({
        _id: String(session._id),
        userAgent: session.userAgent,
        ipAddress: session.ipAddress,
        createdAt: session.createdAt,
        lastLoggedIn: session.lastLoggedIn,
        current: session.token === currentHash,
      }))
      .sort((a, b) => Number(b.current) - Number(a.current)));
  } catch (error) {
    sendServerError(res, 'listSessions', error);
  }
};

/**
 * @desc    Sign out one device (revoking the current one signs this browser out)
 * @route   DELETE /api/profile/sessions/:id
 */
export const revokeSession = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = String(req.params.id);
    const result = mongoose.isValidObjectId(id)
      ? await Session.updateOne({ _id: id, user: req.user?._id, isValid: true }, { isValid: false })
      : null;
    if (!result?.modifiedCount) {
      res.status(404).json({ message: 'Session not found' });
      return;
    }
    res.status(200).json({ message: 'Session signed out', id });
  } catch (error) {
    sendServerError(res, 'revokeSession', error);
  }
};

/**
 * @desc    Sign out every other device
 * @route   POST /api/profile/sessions/revoke-others
 */
export const revokeOtherSessions = async (req: Request, res: Response): Promise<void> => {
  try {
    const currentToken = getBearerToken(req.headers.authorization);
    const result = await Session.updateMany(
      { user: req.user?._id, isValid: true, ...(currentToken && { token: { $ne: hashToken(currentToken) } }) },
      { isValid: false },
    );
    res.status(200).json({ message: 'Other sessions signed out', revoked: result.modifiedCount });
  } catch (error) {
    sendServerError(res, 'revokeOtherSessions', error);
  }
};
