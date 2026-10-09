import { Request, Response } from 'express';
import { isWorkspaceOwner } from '../utils/workspaceHelpers.js';
import Role from '../models/roleModel.js';
import Workspace from '../models/workspaceModel.js';
import { PERMISSIONS } from '../config/permissions.js';
import {
  sendServerError,
} from '../utils/controllerHelpers.js';
import {
  getInvalidPermissions,
  findCustomRoleOr404,
  hasRoleNameConflict,
} from '../utils/roleHelpers.js';


/** Privilege ceiling: only the workspace owner may define permissions beyond their own. */
const withinOwnPermissions = (req: Request, permissions: string[]): boolean => {
  const workspace = req.workspace!;
  const actorId = String((req as { user?: { _id?: unknown } }).user?._id ?? '');
  if (isWorkspaceOwner(workspace, actorId)) return true;
  const own = req.permissions ?? [];
  return permissions.every(permission => own.includes(permission));
};

// ================================================================
// @desc    List all roles available to a workspace
//          (system roles + workspace's custom roles)
// @route   GET /api/workspaces/:slug/roles
// ================================================================
export const listWorkspaceRoles = async (req: Request, res: Response): Promise<void> => {
  try {
    const workspace = req.workspace!;

    const roles = await Role.find({
      $or: [
        { isSystem: true },
        { workspaceId: workspace._id, isSystem: false },
      ],
    }).sort({ isSystem: -1, name: 1 });

    res.status(200).json(roles);
  } catch (error) {
    sendServerError(res, 'listWorkspaceRoles', error);
  }
};

// ================================================================
// @desc    List the permission catalog (for the role editor UI)
// @route   GET /api/roles/permissions
// ================================================================
export const listPermissions = async (_req: Request, res: Response): Promise<void> => {
  try {
    const grouped = Object.entries(PERMISSIONS).reduce(
      (acc, [key, meta]) => {
        const group = meta.group;
        if (!acc[group]) acc[group] = [];
        acc[group].push({ key, label: meta.label });
        return acc;
      },
      {} as Record<string, { key: string; label: string }[]>
    );

    res.status(200).json(grouped);
  } catch (error) {
    sendServerError(res, 'listPermissions', error);
  }
};

// ================================================================
// @desc    Create a custom role
// @route   POST /api/workspaces/:slug/roles
// @desc    Requires settings:manage
// ================================================================
export const createCustomRole = async (req: Request, res: Response): Promise<void> => {
  try {
    const workspace = req.workspace!;
    const { name, description, permissions } = req.body;

    if (typeof name !== 'string' || !name.trim() || name.trim().length > 60
      || (description !== undefined && (typeof description !== 'string' || description.length > 280))) {
      res.status(400).json({ message: 'Role name (max 60 characters) is required; description max 280 characters' });
      return;
    }

    if (!Array.isArray(permissions)) {
      res.status(400).json({ message: 'Permissions must be an array' });
      return;
    }

    // Validate every permission key exists in the catalog
    const invalidPerms = getInvalidPermissions(permissions);
    if (invalidPerms.length > 0) {
      res.status(400).json({
        message: `Unknown permission(s): ${invalidPerms.join(', ')}`,
      });
      return;
    }
    if (!withinOwnPermissions(req, permissions)) {
      res.status(403).json({ message: "You can't create a role with more access than your own" });
      return;
    }

    // Check for duplicate name in this workspace
    const conflict = await hasRoleNameConflict(workspace._id, name);
    if (conflict) {
      res.status(409).json({ message: 'A role with this name already exists in this workspace' });
      return;
    }

    const role = await Role.create({
      name: name.trim(),
      description: description?.trim() || '',
      permissions,
      isSystem: false,
      workspaceId: workspace._id,
    });

    res.status(201).json(role);
  } catch (error) {
    sendServerError(res, 'createCustomRole', error);
  }
};

// ================================================================
// @desc    Update a custom role
// @route   PUT /api/workspaces/:slug/roles/:id
// @desc    Requires settings:manage
// ================================================================
export const updateCustomRole = async (req: Request, res: Response): Promise<void> => {
  try {
    const workspace = req.workspace!;
    const roleId = String(req.params.id);
    const { name, description, permissions } = req.body;

    const role = await findCustomRoleOr404(workspace._id, roleId, res);
    if (!role) return;

    // ---- Update name (with conflict check) ----
    if ((name !== undefined && (typeof name !== 'string' || name.trim().length > 60))
      || (description !== undefined && (typeof description !== 'string' || description.length > 280))) {
      res.status(400).json({ message: 'Role name max 60 characters; description max 280 characters' });
      return;
    }
    if (name !== undefined) {
      if (!name.trim()) {
        res.status(400).json({ message: 'Role name cannot be empty' });
        return;
      }
      const conflict = await hasRoleNameConflict(workspace._id, name, roleId);
      if (conflict) {
        res.status(409).json({ message: 'A role with this name already exists' });
        return;
      }
      role.name = name.trim();
    }

    // ---- Update description ----
    if (description !== undefined) {
      role.description = description.trim();
    }

    // ---- Update permissions (with validation) ----
    if (permissions !== undefined) {
      if (!Array.isArray(permissions)) {
        res.status(400).json({ message: 'Permissions must be an array' });
        return;
      }
      const invalidPerms = getInvalidPermissions(permissions);
      if (invalidPerms.length > 0) {
        res.status(400).json({
          message: `Unknown permission(s): ${invalidPerms.join(', ')}`,
        });
        return;
      }
      if (!withinOwnPermissions(req, permissions)) {
        res.status(403).json({ message: "You can't give a role more access than your own" });
        return;
      }
      role.permissions = permissions;
    }

    await role.save();
    res.status(200).json(role);
  } catch (error) {
    sendServerError(res, 'updateCustomRole', error);
  }
};

// ================================================================
// @desc    Delete a custom role
// @route   DELETE /api/workspaces/:slug/roles/:id
// @desc    Requires settings:manage
//          Blocked if any member still uses it
// ================================================================
export const deleteCustomRole = async (req: Request, res: Response): Promise<void> => {
  try {
    const workspace = req.workspace!;
    const roleId = String(req.params.id);

    const role = await findCustomRoleOr404(workspace._id, roleId, res);
    if (!role) return;

    // Check if any member (in any workspace) is currently using this role
    const inUse = await Workspace.exists({ 'members.roleId': role._id });
    if (inUse) {
      res.status(409).json({
        message: 'Cannot delete this role — it is currently assigned to one or more members',
      });
      return;
    }

    await Role.findByIdAndDelete(roleId);
    res.status(200).json({ message: 'Role deleted' });
  } catch (error) {
    sendServerError(res, 'deleteCustomRole', error);
  }
};