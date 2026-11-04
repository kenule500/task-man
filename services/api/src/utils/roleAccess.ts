import mongoose from 'mongoose';
import Role, { IRole } from '../models/roleModel.js';
import { SYSTEM_ROLES } from '../config/permissions.js';

// Authorization rules shared by every place that assigns or changes roles
// (joining, invitations, member management).

export const OWNER_ROLE_NAME = 'Product Owner';
export const DEFAULT_ROLE_NAME = 'Viewer';

type RoleLike = Pick<IRole, 'name' | 'isSystem' | 'permissions'>;

const SYSTEM_ROLE_ORDER = SYSTEM_ROLES.map(role => role.name);

/** Seniority used for sorting: system roles in catalog order, custom roles after them. */
export const roleRank = (role: { name: string; isSystem?: boolean }): number => {
  const index = role.isSystem ? SYSTEM_ROLE_ORDER.indexOf(role.name) : -1;
  return index === -1 ? SYSTEM_ROLE_ORDER.length : index;
};

const isOwnerRole = (role: RoleLike): boolean => role.isSystem && role.name === OWNER_ROLE_NAME;

/**
 * A role that may be used in `workspaceId`: a system role or one of that workspace's
 * own custom roles. Returns null for ids from other workspaces, malformed ids and
 * non-string input (blocks `{ "$ne": null }` style operator injection).
 */
export const findAssignableRole = async (
  workspaceId: mongoose.Types.ObjectId | string,
  roleId: unknown,
): Promise<IRole | null> => {
  if (typeof roleId !== 'string' || !mongoose.isValidObjectId(roleId)) return null;
  return Role.findOne({ _id: roleId, $or: [{ isSystem: true }, { workspaceId }] });
};

/** The default role for people joining with an invite code. */
export const findDefaultRole = (): Promise<IRole | null> =>
  Role.findOne({ name: DEFAULT_ROLE_NAME, isSystem: true });

/**
 * Whether an actor may hand out `target` (or act on someone who holds it):
 * the workspace owner may do anything; everyone else only up to their own
 * permissions, and never the Product Owner role.
 */
export const canGrantRole = (
  actorPermissions: readonly string[],
  target: RoleLike,
  actorIsOwner: boolean,
): boolean =>
  actorIsOwner || (!isOwnerRole(target) && target.permissions.every(permission => actorPermissions.includes(permission)));
