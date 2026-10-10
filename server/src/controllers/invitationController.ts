import { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import mongoose from 'mongoose';
import { recordActivity } from '../utils/activity.js';
import Invitation from '../models/invitationModel.js';
import Workspace from '../models/workspaceModel.js';
import User from '../models/userModel.js';
import { sendEmail } from '../utils/sendEmail.js';
import { invitationTemplate } from '../utils/emailTemplates.js';
import { buildInviteLink } from '../utils/requestHelpers.js';
import { requireUserId } from '../utils/controllerHelpers.js';
import { loadPendingInvitation, isMemberOfWorkspace } from '../utils/invitationHelpers.js';
import { canGrantRole, findAssignableRole } from '../utils/roleAccess.js';
import { isWorkspaceOwner } from '../utils/workspaceHelpers.js';
import { createSecureToken } from '../utils/tokens.js';
import type { IWorkspace } from '../models/workspaceModel.js';

/** a.b@example.com → a***@example.com: enough to recognise, not to harvest. */
const maskEmail = (email: string): string => {
  const [local, domain] = email.split('@');
  return `${local.slice(0, 1)}***@${domain ?? ''}`;
};

const INVITE_EXPIRY_DAYS = 3;

/** Same email normalisation as signup, so the invited address matches the account address. */
export const validateCreateInvitation = [
  body('email').isString().isEmail().withMessage('A valid email is required').isLength({ max: 254 }).normalizeEmail(),
  body('roleId').isString().withMessage('Role is required'),
];

// ================================================================
// @desc    Create an invitation
// @route   POST /api/workspaces/:slug/invitations
// @desc    Requires users:write permission (enforced by middleware)
// ================================================================
export const createInvitation = async (req: Request, res: Response): Promise<void> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    const workspace = req.workspace as IWorkspace;

    const inviterId = requireUserId(req, res);
    if (!inviterId) return;

    // The route's express-validator chain checked and normalised the email exactly like signup
    const { email: normalizedEmail, roleId } = req.body as { email: string; roleId: unknown };

    // Only this workspace's custom roles or system roles, and never above the inviter's own access
    const role = await findAssignableRole(workspace._id as mongoose.Types.ObjectId, roleId);
    if (!role) {
      res.status(404).json({ message: 'Role not found' });
      return;
    }
    if (!canGrantRole(req.permissions ?? [], role, isWorkspaceOwner(workspace, inviterId))) {
      res.status(403).json({ message: "You can't invite someone with more access than your own" });
      return;
    }

    // Prevent inviting users who are already members
    const existingUser = await User.findOne({ email: { $eq: normalizedEmail } });
    if (existingUser) {
      const alreadyMember = await isMemberOfWorkspace(
        workspace._id,
        existingUser._id.toString()
      );
      if (alreadyMember) {
        res.status(400).json({ message: 'This user is already a member of this workspace' });
        return;
      }
    }

    // Cancel any existing pending invitation for this email
    await Invitation.updateMany(
      { workspaceId: workspace._id, email: { $eq: normalizedEmail }, status: 'pending' },
      { status: 'expired' }
    );

    // Create the new invitation (only the token hash is stored)
    const { token, hash } = createSecureToken();
    const expiresAt = new Date(Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

    const invitation = await Invitation.create({
      workspaceId: workspace._id,
      invitedBy: inviterId,
      email: normalizedEmail,
      roleId: role._id,
      token: hash,
      expiresAt,
    });

    await recordActivity(req, {
      action: 'invitation.sent', summary: normalizedEmail, changes: [{ field: 'role', to: role.name }],
    });

    // Send the invitation email
    const inviter = await User.findById(inviterId).select('name');
    const acceptLink = buildInviteLink(token);

    try {
      await sendEmail({
        to: normalizedEmail,
        ...invitationTemplate(
          workspace.name,
          role.name,
          inviter?.name || 'A teammate',
          acceptLink
        ),
      });
    } catch (emailError) {
      // Never log the link: it is a bearer credential
      console.error('⚠️ Invitation email failed to send:', emailError);
    }

    res.status(201).json({
      _id: invitation._id,
      email: invitation.email,
      roleId: invitation.roleId,
      status: invitation.status,
      expiresAt: invitation.expiresAt,
    });
  } catch (error) {
    console.error('createInvitation error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ================================================================
// @desc    List pending invitations for a workspace
// @route   GET /api/workspaces/:slug/invitations
// @desc    Requires users:read
// ================================================================
export const listInvitations = async (req: Request, res: Response): Promise<void> => {
  try {
    const workspace = (req as { workspace?: { _id: string } }).workspace!;

    const invitations = await Invitation.find({
      workspaceId: workspace._id,
      status: 'pending',
      expiresAt: { $gt: new Date() },
    })
      .select('-token')
      .populate('roleId', 'name')
      .populate('invitedBy', 'name')
      .sort({ createdAt: -1 });

    res.status(200).json(invitations);
  } catch (error) {
    console.error('listInvitations error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ================================================================
// @desc    Cancel an invitation
// @route   DELETE /api/workspaces/:slug/invitations/:id
// @desc    Requires users:write
// ================================================================
export const cancelInvitation = async (req: Request, res: Response): Promise<void> => {
  try {
    const workspace = (req as { workspace?: { _id: string } }).workspace!;
    const id = String(req.params.id);
    if (!mongoose.isValidObjectId(id)) {
      res.status(404).json({ message: 'Invitation not found or already resolved' });
      return;
    }

    const invitation = await Invitation.findOneAndUpdate(
      { _id: id, workspaceId: workspace._id, status: 'pending' },
      { status: 'expired' },
      { returnDocument: 'after' }
    );

    if (!invitation) {
      res.status(404).json({ message: 'Invitation not found or already resolved' });
      return;
    }

    await recordActivity(req, { action: 'invitation.cancelled', summary: invitation.email });
    res.status(200).json({ message: 'Invitation cancelled' });
  } catch (error) {
    console.error('cancelInvitation error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ================================================================
// @desc    Get invitation details by token (for the accept page)
// @route   GET /api/invitations/:token
// @desc    Public — token is the auth
// ================================================================
export const getInvitationByToken = async (req: Request, res: Response): Promise<void> => {
  try {
    // Express types req.params values as `string | string[]` for wildcard safety.
    // We know it's a string because our route defines `:token`, so we cast.
    const token = String(req.params.token);

    const { invitation, error } = await loadPendingInvitation(token);
    if (error || !invitation) {
      res.status(error!.status).json({ message: error!.message });
      return;
    }

    // Re-fetch with populated fields (loadPendingInvitation returns the raw doc)
    const populated = await Invitation.findById(invitation._id)
      .populate('workspaceId', 'name')
      .populate('roleId', 'name description')
      .populate('invitedBy', 'name');

    if (!populated) {
      res.status(500).json({ message: 'Failed to load invitation details' });
      return;
    }

    res.status(200).json({
      workspace: populated.workspaceId,
      role: populated.roleId,
      invitedBy: populated.invitedBy,
      // Public endpoint: mask the address so a leaked link doesn't expose it
      email: maskEmail(populated.email),
      expiresAt: populated.expiresAt,
    });
  } catch (error) {
    console.error('getInvitationByToken error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ================================================================
// @desc    Accept invitation
// @route   POST /api/invitations/:token/accept
// @desc    Requires auth (any logged-in user)
// ================================================================
export const acceptInvitation = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const token = String(req.params.token);

    const { invitation, error } = await loadPendingInvitation(token);
    if (error || !invitation) {
      res.status(error!.status).json({ message: error!.message });
      return;
    }

    // The invitation belongs to one address: a forwarded or leaked link is useless to anyone else
    const account = await User.findById(userId).select('email');
    if (!account || account.email !== invitation.email) {
      res.status(403).json({ message: 'This invitation was sent to a different email address' });
      return;
    }

    // Claim it atomically so two parallel requests can't both use it
    const claimed = await Invitation.findOneAndUpdate(
      { _id: invitation._id, status: 'pending', expiresAt: { $gt: new Date() } },
      { status: 'accepted' },
      { returnDocument: 'after' }
    );
    if (!claimed) {
      res.status(400).json({ message: 'Invitation already used or expired' });
      return;
    }

    const workspace = await Workspace.findById(invitation.workspaceId);
    if (!workspace) {
      res.status(404).json({ message: 'Workspace not found' });
      return;
    }

    // The role may have been deleted since the invitation was sent
    const role = await findAssignableRole(workspace._id as mongoose.Types.ObjectId, String(invitation.roleId));
    if (!role) {
      res.status(409).json({ message: 'The role in this invitation no longer exists. Ask for a new invitation.' });
      return;
    }

    // Add the member only if not already there (atomic, no duplicates)
    await Workspace.updateOne(
      { _id: workspace._id, 'members.user': { $ne: new mongoose.Types.ObjectId(userId) } },
      { $push: { members: { user: new mongoose.Types.ObjectId(userId), roleId: role._id, joinedAt: new Date() } } }
    );

    // Add workspace to user
    await User.findByIdAndUpdate(userId, {
      $addToSet: { workspaces: workspace._id },
      $set: { activeWorkspace: workspace._id },
    });

    res.status(200).json({
      message: 'Invitation accepted',
      workspace: { _id: workspace._id, name: workspace.name, slug: workspace.slug },
    });
  } catch (error) {
    console.error('acceptInvitation error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ================================================================
// @desc    Decline invitation
// @route   POST /api/invitations/:token/decline
// @desc    Requires auth
// ================================================================
export const declineInvitation = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const token = String(req.params.token);

    const { invitation, error } = await loadPendingInvitation(token);
    if (error || !invitation) {
      res.status(error!.status).json({ message: error!.message });
      return;
    }

    const account = await User.findById(userId).select('email');
    if (!account || account.email !== invitation.email) {
      res.status(403).json({ message: 'This invitation was sent to a different email address' });
      return;
    }

    invitation.status = 'declined';
    await invitation.save();

    res.status(200).json({ message: 'Invitation declined' });
  } catch (error) {
    console.error('declineInvitation error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};