import { Request, Response } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { body, validationResult } from 'express-validator';

import User from '../models/userModel.js';
import Session from '../models/sessionModel.js';
import Workspace from '../models/workspaceModel.js';
import Role from '../models/roleModel.js';
import { sendEmail } from '../utils/sendEmail.js';
import { verifyEmailTemplate, resetPasswordTemplate } from '../utils/emailTemplates.js';
import { deriveActions } from '../config/permissions.js';
import { createSecureToken, getBearerToken, hashToken } from '../utils/tokens.js';
import { getConfig } from '../config/env.js';

// ============================================================
// Password rules
// ============================================================
export const MIN_PASSWORD_LENGTH = 8;

const passwordRule = (field: string) =>
  body(field)
    .isString()
    .withMessage('Password is required')
    .isLength({ min: MIN_PASSWORD_LENGTH })
    .withMessage(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);

const emailRule = () =>
  body('email')
    .isEmail()
    .withMessage('Please provide a valid email')
    .normalizeEmail();

// ============================================================
// Validation rules
// ============================================================
export const validateSignup = [
  body('name').isString().trim().notEmpty().withMessage('Name is required')
    .isLength({ max: 80 }).withMessage('Name must be 80 characters or fewer'),
  emailRule(),
  passwordRule('password'),
];

// Reject objects like `{ "$gt": "" }` (NoSQL operator injection)
export const validateLogin = [
  emailRule(),
  body('password').isString().notEmpty().withMessage('Password is required'),
];

export const validateResendVerification = [emailRule()];

export const validateForgotPassword = [emailRule()];

export const validateResetPassword = [passwordRule('password')];

// ============================================================
// Helpers
// ============================================================

/** Whether the app should auto-verify new signups (dev convenience). */
const isDevAutoVerify = (): boolean => process.env.DEV_AUTO_VERIFY === 'true';

// jti makes every token unique, so each login gets its own revocable session
const generateToken = (id: string): string => {
  // Long enough to stay signed in for a working week; every session is revocable server-side
  return jwt.sign({ id }, getConfig().jwtSecret, { expiresIn: '7d', jwtid: crypto.randomUUID() });
};

/** Build an absolute URL to a frontend path (e.g. /verify-email/abc123). */
const appLink = (path: string): string => `${getConfig().clientUrl}${path}`;

/** Only the token hash is stored, so a database leak can't be replayed as sessions. */
const createSession = async (userId: string, token: string, req: Request) => {
  const userAgent = req.headers['user-agent'] || 'Unknown Device';
  const ipAddress = req.ip || req.socket.remoteAddress || 'Unknown IP';
  await Session.create({
    user: userId,
    token: hashToken(token),
    userAgent,
    ipAddress,
    lastLoggedIn: new Date(),
  });
};

const generateSlug = async (name: string): Promise<string> => {
  const base =
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 40) || 'workspace';

  let slug = base;
  let counter = 1;
  while (await Workspace.exists({ slug })) {
    slug = `${base}-${counter}`;
    counter++;
  }
  return slug;
};

// ================================================================
// @desc    Register a new user (sends verification email unless auto-verify)
// @route   POST /api/auth/signup
// ================================================================
export const registerUser = async (req: Request, res: Response): Promise<void> => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }

  try {
    const { name, email, password } = req.body;

    const userExists = await User.findOne({ email: { $eq: String(email) } });
    if (userExists) {
      res.status(400).json({ message: 'User already exists' });
      return;
    }

    const autoVerify = isDevAutoVerify();

    // In dev auto-verify mode we skip the token entirely
    const verification = autoVerify ? null : createSecureToken();
    const verificationTokenExpires = autoVerify
      ? undefined
      : new Date(Date.now() + 24 * 60 * 60 * 1000);

    const user = await User.create({
      name,
      email,
      password,
      isVerified: autoVerify,
      verificationToken: verification?.hash,
      verificationTokenExpires,
    });

    // Only send the email if we're NOT in auto-verify mode
    if (verification) {
      const verifyLink = appLink(`/verify-email/${verification.token}`);

      try {
        await sendEmail({
          to: user.email,
          ...verifyEmailTemplate(verifyLink),
        });
      } catch (emailError) {
        console.error('⚠️ Verification email failed to send:', emailError);
        // The link is a credential: only print it for local development
        if (process.env.NODE_ENV !== 'production') console.log('📧 Verification link (for manual testing):', verifyLink);
      }
    }

    res.status(201).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      message: autoVerify
        ? 'Account created and verified. You can log in now.'
        : 'Account created! Please check your email to verify your account.',
      requiresVerification: !autoVerify,
    });
  } catch (error) {
    console.error('registerUser error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ================================================================
// @desc    Verify email with token
// @route   GET /api/auth/verify-email/:token
// ================================================================
export const verifyEmail = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = String(req.params.token);

    const user = await User.findOne({
      verificationToken: hashToken(token),
      verificationTokenExpires: { $gt: new Date() },
    });

    if (user) {
      user.isVerified = true;
      user.verificationToken = undefined;
      user.verificationTokenExpires = undefined;
      await user.save();
      res.status(200).json({ message: 'Email verified successfully! You can now log in.' });
      return;
    }

    res.status(400).json({
      message:
        'This verification link has already been used or has expired. Try logging in — if that fails, request a new link.',
    });
  } catch (error) {
    console.error('verifyEmail error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ================================================================
// @desc    Resend verification email
// @route   POST /api/auth/resend-verification
// ================================================================
export const resendVerification = async (req: Request, res: Response): Promise<void> => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }

  // Same answer whether or not the account exists — prevents email enumeration
  const genericResponse = {
    message: 'If this account needs verification, a new email has been sent.',
  };

  try {
    const { email } = req.body;
    const user = await User.findOne({ email: { $eq: String(email) } });

    if (!user || user.isVerified) {
      res.status(200).json(genericResponse);
      return;
    }

    const verification = createSecureToken();
    user.verificationToken = verification.hash;
    user.verificationTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await user.save();

    await sendEmail({
      to: user.email,
      ...verifyEmailTemplate(appLink(`/verify-email/${verification.token}`)),
    });

    res.status(200).json(genericResponse);
  } catch (error) {
    console.error('resendVerification error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ================================================================
// @desc    Login user (requires verified email)
// @route   POST /api/auth/login
// ================================================================
export const loginUser = async (req: Request, res: Response): Promise<void> => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(401).json({ message: 'Invalid email or password' });
    return;
  }

  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email: { $eq: String(email) } });

    if (user && (await user.matchPassword(password))) {
      if (!user.isVerified) {
        res.status(403).json({
          message: 'Please verify your email before logging in.',
          requiresVerification: true,
        });
        return;
      }

      const token = generateToken(user._id.toString());
      await createSession(user._id.toString(), token, req);

      const activeWs = user.activeWorkspace
        ? await Workspace.findById(user.activeWorkspace).select('slug name')
        : null;

      res.json({
        _id: user._id,
        name: user.name,
        email: user.email,
        token,
        onboardingComplete: !!(user.onboarding?.completedAt),
        activeWorkspace: user.activeWorkspace,
        activeWorkspaceSlug: activeWs?.slug || null,
        workspaces: user.workspaces,
      });
    } else {
      res.status(401).json({ message: 'Invalid email or password' });
    }
  } catch (error) {
    console.error('loginUser error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ================================================================
// @desc    Get the current user's identity + role + permissions
// @route   GET /api/auth/currentuser?workspaceSlug=gomycode
// ================================================================
export const getCurrentUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as { user?: { _id?: string } }).user?._id;
    if (!userId) {
      res.status(401).json({ message: 'Not authorized' });
      return;
    }

    const workspaceSlug = req.query.workspaceSlug as string | undefined;

    const user = await User.findById(userId).select(
      '-password -verificationToken -verificationTokenExpires -resetPasswordToken -resetPasswordExpires'
    );
    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    // Resolve workspace: prefer URL slug, fall back to user's active workspace
    let workspace = null;
    const objectId = new mongoose.Types.ObjectId(userId);

    if (workspaceSlug) {
      workspace = await Workspace.findOne({
        slug: { $eq: String(workspaceSlug) },
        'members.user': objectId,
      });
    } else if (user.activeWorkspace) {
      workspace = await Workspace.findById(user.activeWorkspace);
    }

    // No workspace context → return user with no permissions
    if (!workspace) {
      res.status(200).json({
        user: { _id: user._id, name: user.name, email: user.email },
        workspace: null,
        role: null,
        permissions: [],
        actions: [],
      });
      return;
    }

    const membership = workspace.members.find(
      (m) => m.user.toString() === userId.toString()
    );

    if (!membership) {
      res.status(403).json({ message: 'Not a member of this workspace' });
      return;
    }

    // Self-healing: if roleId is missing, assign a sensible default
    if (!membership.roleId) {
      const isOwner = workspace.owner.toString() === userId.toString();
      const defaultRoleName = isOwner ? 'Product Owner' : 'Viewer';

      const defaultRole = await Role.findOne({ name: defaultRoleName, isSystem: true });
      if (!defaultRole) {
        res.status(500).json({ message: 'System roles not seeded. Restart the server.' });
        return;
      }

      membership.roleId = defaultRole._id as mongoose.Types.ObjectId;
      await workspace.save();
      console.log(
        `🔧 Auto-repaired role for ${user.email} in ${workspace.slug} → ${defaultRoleName}`
      );
    }

    const role = await Role.findById(membership.roleId);
    if (!role) {
      res.status(500).json({ message: 'Role not found — data integrity issue' });
      return;
    }

    res.status(200).json({
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
      },
      workspace: {
        _id: workspace._id,
        name: workspace.name,
        slug: workspace.slug,
      },
      role: {
        _id: role._id,
        name: role.name,
        description: role.description,
      },
      permissions: role.permissions,
      actions: deriveActions(role.permissions),
    });
  } catch (error) {
    console.error('getCurrentUser error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ================================================================
// @desc    Request password reset
// @route   POST /api/auth/forgot-password
// ================================================================
export const forgotPassword = async (req: Request, res: Response): Promise<void> => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }

  try {
    const { email } = req.body;
    const user = await User.findOne({ email: { $eq: String(email) } });

    if (!user) {
      res.status(200).json({ message: 'If an account exists, a reset link has been sent.' });
      return;
    }

    const reset = createSecureToken();
    user.resetPasswordToken = reset.hash;
    user.resetPasswordExpires = new Date(Date.now() + 60 * 60 * 1000);
    await user.save();

    const resetLink = appLink(`/reset-password/${reset.token}`);

    await sendEmail({
      to: user.email,
      ...resetPasswordTemplate(resetLink),
    });

    res.status(200).json({ message: 'If an account exists, a reset link has been sent.' });
  } catch (error) {
    console.error('forgotPassword error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ================================================================
// @desc    Reset password with token
// @route   POST /api/auth/reset-password/:token
// ================================================================
export const resetPassword = async (req: Request, res: Response): Promise<void> => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }

  try {
    const token = String(req.params.token);
    const { password } = req.body;

    const user = await User.findOne({
      resetPasswordToken: hashToken(token),
      resetPasswordExpires: { $gt: new Date() },
    });

    if (!user) {
      res.status(400).json({ message: 'Invalid or expired reset token' });
      return;
    }

    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    // Sign out every session on this account
    await Session.updateMany({ user: user._id }, { isValid: false });

    res.status(200).json({ message: 'Password reset successful! You can now log in.' });
  } catch (error) {
    console.error('resetPassword error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ================================================================
// @desc    Save onboarding data + create first workspace (RBAC)
// @route   POST /api/auth/onboarding
// ================================================================
export const saveOnboarding = async (req: Request, res: Response): Promise<void> => {
  try {
    const { role, useCase, teamSize, workspaceName } = req.body;
    if (workspaceName !== undefined && workspaceName !== null
      && (typeof workspaceName !== 'string' || workspaceName.trim().length > 60)) {
      res.status(400).json({ message: 'Workspace name must be text of 60 characters or fewer' });
      return;
    }
    if ([role, useCase, teamSize].some(value => value !== undefined && (typeof value !== 'string' || value.length > 80))) {
      res.status(400).json({ message: 'Invalid onboarding answers' });
      return;
    }
    const userId = (req as { user?: { _id?: string } }).user?._id;
    if (!userId) {
      res.status(401).json({ message: 'Not authorized' });
      return;
    }

    const user = await User.findById(userId);
    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    // Idempotency — if the user already has a workspace, return it
    if (user.workspaces && user.workspaces.length > 0) {
      const existingWorkspace = await Workspace.findById(user.workspaces[0]);
      if (!user.onboarding?.completedAt) {
        user.onboarding = { role, useCase, teamSize, completedAt: new Date() };
        await user.save();
      }
      res.status(200).json({
        message: 'Onboarding already completed',
        onboarding: user.onboarding,
        workspace: existingWorkspace,
      });
      return;
    }

    // Look up the Product Owner system role
    const ownerRole = await Role.findOne({ name: 'Product Owner', isSystem: true });
    if (!ownerRole) {
      res.status(500).json({ message: 'Product Owner role not found. Server not seeded.' });
      return;
    }

    const finalName = (workspaceName || `${user.name}'s Workspace`).trim();
    const slug = await generateSlug(finalName);

    const inviteCode = crypto.randomBytes(6).toString('hex').toUpperCase();
    const workspace = await Workspace.create({
      name: finalName,
      slug,
      owner: user._id,
      members: [{ user: user._id, roleId: ownerRole._id, joinedAt: new Date() }],
      inviteCode,
    });

    user.onboarding = { role, useCase, teamSize, completedAt: new Date() };
    user.workspaces = [workspace._id];
    user.activeWorkspace = workspace._id;
    await user.save();

    res.status(200).json({
      message: 'Onboarding saved successfully',
      onboarding: user.onboarding,
      workspace,
    });
  } catch (error) {
    console.error('saveOnboarding error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ================================================================
// @desc    Logout user / invalidate session
// @route   POST /api/auth/logout
// ================================================================
export const logoutUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = getBearerToken(req.headers.authorization);
    if (token) {
      await Session.findOneAndUpdate({ token: hashToken(token) }, { isValid: false });
    }
    res.status(200).json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('logoutUser error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};