import { Request, Response } from 'express';
import crypto from 'crypto';
import mongoose from 'mongoose';
import Invitation from '../models/invitationModel.js';
import Workspace from '../models/workspaceModel.js';
import Role from '../models/roleModel.js';
import User from '../models/userModel.js';
import { sendEmail } from '../utils/sendEmail.js';
import { invitationTemplate } from '../utils/emailTemplates.js';
import { buildInviteLink } from '../utils/requestHelpers.js';
import { requireUserId } from '../utils/controllerHelpers.js';
import { loadPendingInvitation, isMemberOfWorkspace } from '../utils/invitationHelpers.js';

const INVITE_EXPIRY_DAYS = 3;

// ================================================================
// @desc    Create an invitation
// @route   POST /api/workspaces/:slug/invitations
// @desc    Requires users:write permission (enforced by middleware)
// ================================================================
export const createInvitation = async (req: Request, res: Response): Promise<void> => {
  try {
    const workspace = (req as { workspace?: { _id: string; name: string; slug: string } }).workspace!;

    const inviterId = requireUserId(req, res);
    if (!inviterId) return;

    const { email, roleId } = req.body;
    if (!email || !email.trim()) {
      res.status(400).json({ message: 'Email is required' });
      return;
    }
    if (!roleId) {
      res.status(400).json({ message: 'Role is required' });
      return;
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Validate role exists
    const role = await Role.findById(roleId);
    if (!role) {
      res.status(404).json({ message: 'Role not found' });
      return;
    }

    // Prevent inviting users who are already members
    const existingUser = await User.findOne({ email: normalizedEmail });
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
      { workspaceId: workspace._id, email: normalizedEmail, status: 'pending' },
      { status: 'expired' }
    );

    // Create the new invitation
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

    const invitation = await Invitation.create({
      workspaceId: workspace._id,
      invitedBy: inviterId,
      email: normalizedEmail,
      roleId,
      token,
      expiresAt,
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
      console.error('⚠️ Invitation email failed to send:', emailError);
      console.log('🔗 Invitation link (for manual testing):', acceptLink);
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
      .populate('roleId', 'name')
      .populate('invitedBy', 'name email')
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
    const { id } = req.params;

    const invitation = await Invitation.findOneAndUpdate(
      { _id: id, workspaceId: workspace._id, status: 'pending' },
      { status: 'expired' },
      { returnDocument: 'after' }
    );

    if (!invitation) {
      res.status(404).json({ message: 'Invitation not found or already resolved' });
      return;
    }

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
      .populate('workspaceId', 'name slug')
      .populate('roleId', 'name description')
      .populate('invitedBy', 'name email');

    if (!populated) {
      res.status(500).json({ message: 'Failed to load invitation details' });
      return;
    }

    res.status(200).json({
      workspace: populated.workspaceId,
      role: populated.roleId,
      invitedBy: populated.invitedBy,
      email: populated.email,
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

    const workspace = await Workspace.findById(invitation.workspaceId);
    if (!workspace) {
      res.status(404).json({ message: 'Workspace not found' });
      return;
    }

    // Already a member?
    const alreadyMember = workspace.members.some(
      (m) => m.user.toString() === userId.toString()
    );
    if (alreadyMember) {
      invitation.status = 'accepted';
      await invitation.save();
      res.status(200).json({ message: 'You are already a member', workspace });
      return;
    }

    // Add user to workspace
    workspace.members.push({
      user: new mongoose.Types.ObjectId(userId) as any,
      roleId: invitation.roleId as any,
      joinedAt: new Date(),
    });
    await workspace.save();

    // Add workspace to user
    await User.findByIdAndUpdate(userId, {
      $addToSet: { workspaces: workspace._id },
      $set: { activeWorkspace: workspace._id },
    });

    // Mark accepted
    invitation.status = 'accepted';
    await invitation.save();

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
    const token = String(req.params.token);

    const { invitation, error } = await loadPendingInvitation(token);
    if (error || !invitation) {
      res.status(error!.status).json({ message: error!.message });
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