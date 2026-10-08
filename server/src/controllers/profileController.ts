import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import User from '../models/userModel.js';
import Session from '../models/sessionModel.js';

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

/** Minimum password length. */
const MIN_PASSWORD_LENGTH = 6;

/** Extract the token from an `Authorization: Bearer xxx` header. */
const getBearerToken = (authorizationHeader?: string): string | null => {
  if (!authorizationHeader) return null;
  const [scheme, token] = authorizationHeader.split(' ');
  if (scheme !== 'Bearer' || !token) return null;
  return token;
};

/** Hash a token for storage (matches whatever the session model uses). */
const hashToken = (token: string): string => {
  // If your session model stores raw tokens, this returns the same string.
  // If it stores hashed tokens (e.g. SHA-256), replace this with:
  //   import crypto from 'crypto';
  //   return crypto.createHash('sha256').update(token).digest('hex');
  return token;
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
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
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

    const { email, taskAssigned, taskCompleted, weeklyDigest } = req.body;

    const user = await User.findByIdAndUpdate(
      userId,
      {
        notifications: { email, taskAssigned, taskCompleted, weeklyDigest },
      },
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