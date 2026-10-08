import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Workspace from '../models/workspaceModel.js';
import Role from '../models/roleModel.js';
import { requireUserId } from '../utils/controllerHelpers.js';
import { findMember, isWorkspaceOwner } from '../utils/workspaceHelpers.js';

// ================================================================
// @desc    Change a member's role
// @route   PUT /api/workspaces/:slug/members/:userId/role
// @desc    Requires users:write (enforced by middleware)
// ================================================================
export const changeMemberRole = async (req: Request, res: Response): Promise<void> => {
  try {
    const workspace = req.workspace!;
    const currentUserId = requireUserId(req, res);
    if (!currentUserId) return;

    const targetUserId = String(req.params.userId);
    const { roleId } = req.body;

    if (!roleId) {
      res.status(400).json({ message: 'Role is required' });
      return;
    }

    // Can't change your own role
    if (currentUserId === targetUserId) {
      res.status(400).json({ message: "You can't change your own role" });
      return;
    }

    // Can't change the workspace owner's role
    if (isWorkspaceOwner(workspace, targetUserId)) {
      res.status(403).json({ message: "The workspace owner's role cannot be changed" });
      return;
    }

    // Validate role
    const role = await Role.findById(roleId);
    if (!role) {
      res.status(404).json({ message: 'Role not found' });
      return;
    }

    // Find the member
    const member = findMember(workspace, targetUserId);
    if (!member) {
      res.status(404).json({ message: 'Member not found in this workspace' });
      return;
    }

    // Update the role and save the workspace
    // (the middleware already gave us a full Mongoose document)
    member.roleId = role._id as mongoose.Types.ObjectId;
    await workspace.save();

    res.status(200).json({
      message: 'Role updated',
      userId: targetUserId,
      role: { _id: role._id, name: role.name, description: role.description },
    });
  } catch (error) {
    console.error('changeMemberRole error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ================================================================
// @desc    Remove a member from a workspace
// @route   DELETE /api/workspaces/:slug/members/:userId
// @desc    Requires users:write
// ================================================================
export const removeMember = async (req: Request, res: Response): Promise<void> => {
  try {
    const workspace = req.workspace!;
    const currentUserId = requireUserId(req, res);
    if (!currentUserId) return;

    const targetUserId = String(req.params.userId);

    // Can't remove yourself
    if (currentUserId === targetUserId) {
      res.status(400).json({ message: "You can't remove yourself from the workspace" });
      return;
    }

    // Can't remove the owner
    if (isWorkspaceOwner(workspace, targetUserId)) {
      res.status(403).json({ message: 'The workspace owner cannot be removed' });
      return;
    }

    // Check the member exists before removing
    const member = findMember(workspace, targetUserId);
    if (!member) {
      res.status(404).json({ message: 'Member not found in this workspace' });
      return;
    }

    // Remove the member and save
    workspace.members = workspace.members.filter(
      (m) => m.user.toString() !== targetUserId
    );
    await workspace.save();

    // Remove the workspace reference from the user
    await mongoose.model('User').findByIdAndUpdate(targetUserId, {
      $pull: { workspaces: workspace._id },
    });

    res.status(200).json({ message: 'Member removed' });
  } catch (error) {
    console.error('removeMember error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};