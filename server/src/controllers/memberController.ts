import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { auditLookup, recordActivity } from '../utils/activity.js';
import Workspace from '../models/workspaceModel.js';
import Role from '../models/roleModel.js';
import { requireUserId } from '../utils/controllerHelpers.js';
import { findMember, isWorkspaceOwner } from '../utils/workspaceHelpers.js';
import { canGrantRole, findAssignableRole } from '../utils/roleAccess.js';

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

    // Only this workspace's custom roles or system roles can be assigned
    const role = await findAssignableRole(workspace._id as mongoose.Types.ObjectId, roleId);
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

    // Privilege ceiling: nobody but the owner can act above their own access level
    const actorIsOwner = isWorkspaceOwner(workspace, currentUserId);
    const actorPermissions = req.permissions ?? [];
    const currentRole = await Role.findById(member.roleId);
    if (currentRole && !canGrantRole(actorPermissions, currentRole, actorIsOwner)) {
      res.status(403).json({ message: "You can't change the role of someone with more access than you" });
      return;
    }
    if (!canGrantRole(actorPermissions, role, actorIsOwner)) {
      res.status(403).json({ message: "You can't grant a role with more access than your own" });
      return;
    }

    // Update the role and save the workspace
    // (the middleware already gave us a full Mongoose document)
    member.roleId = role._id as mongoose.Types.ObjectId;
    await workspace.save();
    const changedUser = await auditLookup(() => mongoose.model('User').findById(targetUserId).select('name').lean<{ name?: string }>());
    await recordActivity(req, {
      action: 'member.role_changed', summary: changedUser?.name ?? targetUserId,
      changes: [{ field: 'role', from: currentRole?.name, to: role.name }],
    });

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

    // Privilege ceiling: only the owner can remove someone with more access
    const memberRole = await Role.findById(member.roleId);
    if (memberRole && !canGrantRole(req.permissions ?? [], memberRole, isWorkspaceOwner(workspace, currentUserId))) {
      res.status(403).json({ message: "You can't remove someone with more access than you" });
      return;
    }

    // Remove the member and save
    workspace.members = workspace.members.filter(
      (m) => m.user.toString() !== targetUserId
    );
    await workspace.save();

    // Remove the workspace reference from the user
    const removedUser = await mongoose.model('User').findByIdAndUpdate(targetUserId, {
      $pull: { workspaces: workspace._id },
    }).select('name activeWorkspace').lean<{ name?: string; activeWorkspace?: mongoose.Types.ObjectId }>();
    // A removed member no longer owns work here, and this workspace is no longer their default one
    await mongoose.model('Task').updateMany(
      { workspace: workspace._id, assignees: new mongoose.Types.ObjectId(targetUserId) },
      { $pull: { assignees: new mongoose.Types.ObjectId(targetUserId) } },
    );
    if (removedUser?.activeWorkspace && String(removedUser.activeWorkspace) === String(workspace._id)) {
      await mongoose.model('User').updateOne({ _id: targetUserId }, { $unset: { activeWorkspace: 1 } });
    }
    await recordActivity(req, {
      action: 'member.removed', summary: removedUser?.name ?? targetUserId,
      changes: [{ field: 'role', from: memberRole?.name }],
    });

    res.status(200).json({ message: 'Member removed' });
  } catch (error) {
    console.error('removeMember error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};
// ================================================================
// @desc    Leave a workspace (any member except the owner)
// @route   DELETE /api/workspaces/:slug/members/me
// ================================================================
export const leaveWorkspace = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = String(req.user?._id ?? '');
    const workspace = await Workspace.findOne({ slug: String(req.params.slug) });
    if (!workspace || !findMember(workspace, userId)) {
      res.status(404).json({ message: 'Workspace not found' });
      return;
    }
    if (isWorkspaceOwner(workspace, userId)) {
      res.status(409).json({ message: "The owner can't leave their own workspace" });
      return;
    }

    workspace.members = workspace.members.filter(m => m.user.toString() !== userId);
    await workspace.save();

    const memberId = new mongoose.Types.ObjectId(userId);
    await mongoose.model('Task').updateMany({ workspace: workspace._id, assignees: memberId }, { $pull: { assignees: memberId } });
    const user = await mongoose.model('User').findByIdAndUpdate(userId, { $pull: { workspaces: workspace._id } })
      .select('name activeWorkspace').lean<{ name?: string; activeWorkspace?: mongoose.Types.ObjectId }>();
    if (user?.activeWorkspace && String(user.activeWorkspace) === String(workspace._id)) {
      await mongoose.model('User').updateOne({ _id: userId }, { $unset: { activeWorkspace: 1 } });
    }

    req.workspace = workspace;
    await recordActivity(req, { action: 'member.left', summary: user?.name ?? userId });
    res.status(200).json({ message: 'You left the workspace' });
  } catch (error) {
    console.error('leaveWorkspace error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};
