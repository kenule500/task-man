import mongoose from 'mongoose';
import Role from '../models/roleModel.js';
import Workspace from '../models/workspaceModel.js';
import { SYSTEM_ROLES } from '../config/permissions.js';

// ================================================================
// Seed system roles (idempotent)
// ================================================================
export const seedSystemRoles = async (): Promise<Record<string, string>> => {
  const roleMap: Record<string, string> = {};

  for (const def of SYSTEM_ROLES) {
    const role = await Role.findOneAndUpdate(
      { name: def.name, isSystem: true },
      {
        name: def.name,
        description: def.description,
        permissions: def.permissions,
        isSystem: true,
        workspaceId: null, 
      },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    );
    roleMap[def.name] = role._id.toString();
  }

  console.log(`✅ Seeded ${Object.keys(roleMap).length} system roles`);
  return roleMap;
};

// ================================================================
// Repair any workspace member that doesn't have a valid roleId.
// Called on every server boot. Idempotent.
// ================================================================
export const repairMemberRoles = async (): Promise<void> => {
  const ownerRole = await Role.findOne({ name: 'Product Owner', isSystem: true });
  const viewerRole = await Role.findOne({ name: 'Viewer', isSystem: true });

  if (!ownerRole || !viewerRole) {
    console.error('⚠️ Cannot repair member roles: system roles not seeded');
    return;
  }

  // Legacy mapping for old string-based roles
  const legacyMap: Record<string, string> = {
    owner: 'Product Owner',
    admin: 'Scrum Master',
    member: 'Developer',
  };

  const legacyRoles = await Role.find({
    name: { $in: Object.values(legacyMap) },
    isSystem: true,
  });
  const legacyRoleIdByName: Record<string, mongoose.Types.ObjectId> = {};
  for (const r of legacyRoles) {
    legacyRoleIdByName[r.name] = r._id as mongoose.Types.ObjectId;
  }

  const workspaces = await Workspace.find({});
  let repaired = 0;

  for (const workspace of workspaces) {
    let changed = false;

    for (const member of workspace.members as any[]) {
      if (!member.roleId) {
        // Determine target role:
        // 1. Legacy string → mapped role
        // 2. Otherwise → Product Owner if they're the workspace owner, else Viewer
        let targetRoleId: mongoose.Types.ObjectId | undefined;

        if (member.role && legacyMap[member.role]) {
          targetRoleId = legacyRoleIdByName[legacyMap[member.role]];
        }

        if (!targetRoleId) {
          const isOwner = member.user.toString() === workspace.owner.toString();
          targetRoleId = isOwner
            ? (ownerRole._id as mongoose.Types.ObjectId)
            : (viewerRole._id as mongoose.Types.ObjectId);
        }

        member.roleId = targetRoleId;
        if (member.role) delete member.role;
        changed = true;
      }
    }

    if (changed) {
      await workspace.save();
      repaired++;
    }
  }

  if (repaired > 0) {
    console.log(`🔧 Repaired member roles in ${repaired} workspace(s)`);
  }
};