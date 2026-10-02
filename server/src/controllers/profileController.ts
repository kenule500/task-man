import { Request, Response } from 'express';
import User from '../models/userModel.js';
import bcrypt from 'bcryptjs';
import Session from '../models/sessionModel.js';
import { MIN_PASSWORD_LENGTH } from './authController.js';
import { getBearerToken, hashToken } from '../utils/tokens.js';

// ================================================================
// @desc    Get current user's profile
// @route   GET /api/profile
// ================================================================
export const getProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as { user?: { _id?: string } }).user?._id;
    if (!userId) {
      res.status(401).json({ message: 'Not authorized' });
      return;
    }

    const user = await User.findById(userId)
      .select('-password -verificationToken -verificationTokenExpires -resetPasswordToken -resetPasswordExpires')
      .populate('workspaces', 'name slug');

    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    res.status(200).json(user);
  } catch (error) {
    console.error('getProfile error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ================================================================
// @desc    Update current user's profile
// @route   PUT /api/profile
// ================================================================
export const updateProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as { user?: { _id?: string } }).user?._id;
    if (!userId) {
      res.status(401).json({ message: 'Not authorized' });
      return;
    }

    const allowedFields = [
      'name', 'avatarUrl', 'bio', 'jobTitle', 'phone',
      'timezone', 'language', 'theme'
    ];

    const updates: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    const user = await User.findByIdAndUpdate(userId, updates, {
      new: true,
      runValidators: true,
    }).select('-password -verificationToken -resetPasswordToken');

    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    res.status(200).json(user);
  } catch (error) {
    console.error('updateProfile error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ================================================================
// @desc    Update notification preferences
// @route   PUT /api/profile/notifications
// ================================================================
export const updateNotifications = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as { user?: { _id?: string } }).user?._id;
    if (!userId) {
      res.status(401).json({ message: 'Not authorized' });
      return;
    }

    const { email, taskAssigned, taskCompleted, weeklyDigest } = req.body;

    const user = await User.findByIdAndUpdate(
      userId,
      {
        notifications: { email, taskAssigned, taskCompleted, weeklyDigest },
      },
      { new: true, runValidators: true }
    ).select('-password');

    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    res.status(200).json(user);
  } catch (error) {
    console.error('updateNotifications error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ================================================================
// @desc    Change password
// @route   PUT /api/profile/password
// ================================================================
export const changePassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as { user?: { _id?: string } }).user?._id;
    if (!userId) {
      res.status(401).json({ message: 'Not authorized' });
      return;
    }

    const { currentPassword, newPassword } = req.body;

    if (typeof currentPassword !== 'string' || typeof newPassword !== 'string' || !currentPassword || !newPassword) {
      res.status(400).json({ message: 'Current and new password are required' });
      return;
    }
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      res.status(400).json({ message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
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
      { user: user._id, ...(currentToken && { token: { $ne: hashToken(currentToken) } }) },
      { isValid: false },
    );

    res.status(200).json({ message: 'Password updated successfully' });
  } catch (error) {
    console.error('changePassword error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};