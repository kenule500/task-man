import { Request, Response } from 'express';
import User from '../models/userModel.js';
import bcrypt from 'bcryptjs';
import {
  requireUserId,
  sendServerError,
  USER_PRIVATE_FIELDS,
} from '../utils/controllerHelpers.js';

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

    if (!currentPassword || !newPassword) {
      res.status(400).json({ message: 'Current and new password are required' });
      return;
    }
    if (newPassword.length < 6) {
      res.status(400).json({ message: 'Password must be at least 6 characters' });
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

    res.status(200).json({ message: 'Password updated successfully' });
  } catch (error) {
    sendServerError(res, 'changePassword', error);
  }
};