import { Response } from 'express';
import mongoose from 'mongoose';
import Role, { IRole } from '../models/roleModel.js';
import { PERMISSIONS } from '../config/permissions.js';

/**
 * Validates that every permission string is a known permission key.
 *
 * Returns null if valid, or an array of invalid keys if not.
 *
 * Usage:
 *   const invalid = getInvalidPermissions(permissions);
 *   if (invalid.length > 0) {
 *     res.status(400).json({ message: `Unknown permission(s): ${invalid.join(', ')}` });
 *     return;
 *   }
 */
export const getInvalidPermissions = (permissions: unknown): string[] => {
  if (!Array.isArray(permissions)) return [];
  return permissions.filter((p) => typeof p !== 'string' || !Object.hasOwn(PERMISSIONS, p));
};

/**
 * Finds a custom (non-system) role belonging to a workspace.
 * Returns the role document, or sends a 404 and returns null.
 *
 * Usage:
 *   const role = await findCustomRoleOr404(workspaceId, id, res);
 *   if (!role) return;
 */
export const findCustomRoleOr404 = async (
  workspaceId: mongoose.Types.ObjectId | string,
  roleId: string,
  res: Response
): Promise<IRole | null> => {
  // Malformed ids are "not found", not a CastError 500
  if (!mongoose.isValidObjectId(roleId)) {
    res.status(404).json({ message: 'Custom role not found' });
    return null;
  }
  const role = await Role.findOne({
    _id: roleId,
    workspaceId,
    isSystem: false,
  });

  if (!role) {
    res.status(404).json({ message: 'Custom role not found' });
    return null;
  }
  return role;
};

/**
 * Checks whether a name is already taken by another custom role
 * in the same workspace. Returns true if there's a conflict.
 *
 * @param excludeId — optional; pass the current role's ID when updating
 */
export const hasRoleNameConflict = async (
  workspaceId: mongoose.Types.ObjectId | string,
  name: string,
  excludeId?: string
): Promise<boolean> => {
  const query: Record<string, unknown> = {
    workspaceId,
    name: name.trim(),
    isSystem: false,
  };

  if (excludeId) {
    query._id = { $ne: excludeId };
  }

  const existing = await Role.findOne(query);
  return !!existing;
};