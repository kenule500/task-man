import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import Workspace from '../models/workspaceModel.js';
import Role from '../models/roleModel.js';
import { PermissionKey } from '../config/permissions.js';

/**
 * Middleware factory: requirePermission('settings:manage')
 *
 * Reads the workspace slug from req.params.slug or req.query.workspaceSlug,
 * verifies the current user is a member, loads their role,
 * and checks the required permission is present.
 *
 * On success, attaches to req:
 *   req.workspace    → the full workspace document
 *   req.role         → the user's role in this workspace
 *   req.permissions  → string[] of permission keys
 */
export const requirePermission = (permission: PermissionKey) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = (req as { user?: { _id?: string } }).user?._id;
      if (!userId) {
        res.status(401).json({ message: 'Not authorized' });
        return;
      }

      const slug =
        req.params.slug ||
        req.params.workspaceSlug ||
        (req.query.workspaceSlug as string | undefined);

      if (!slug) {
        res.status(400).json({ message: 'Workspace slug required' });
        return;
      }

      const objectId = new mongoose.Types.ObjectId(userId);

      const workspace = await Workspace.findOne({
        slug,
        'members.user': objectId,
      });

      if (!workspace) {
        res.status(403).json({ message: 'Not a member of this workspace' });
        return;
      }

      const membership = workspace.members.find(
        (m) => m.user.toString() === userId.toString()
      );

      if (!membership?.roleId) {
        res.status(403).json({ message: 'No role assigned in this workspace' });
        return;
      }

      const role = await Role.findById(membership.roleId);
      if (!role) {
        res.status(500).json({ message: 'Role not found — data integrity issue' });
        return;
      }

      if (!role.permissions.includes(permission)) {
        res.status(403).json({
          message: `Missing permission: ${permission}`,
          required: permission,
          yourRole: role.name,
        });
        return;
      }

      (req as { workspace?: unknown }).workspace = workspace;
      (req as { role?: unknown }).role = role;
      (req as { permissions?: unknown }).permissions = role.permissions;

      next();
    } catch (error) {
      console.error('requirePermission error:', error);
      res.status(500).json({ message: 'Server error' });
    }
  };
};