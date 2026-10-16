/** Shapes and pure helpers shared by the role views on the workspace settings page. */
import { t } from '@/i18n';

export interface PermissionOption {
  key: string;
  label: string;
}

/** Permission catalog as returned by `GET /roles/permissions`: group name to permissions. */
export type PermissionCatalog = Record<string, PermissionOption[]>;

export interface RbacRole {
  _id: string;
  name: string;
  description: string;
  permissions: string[];
  isSystem: boolean;
}

/** System roles in rank order, highest first. */
export const SYSTEM_ROLE_ORDER = ['Product Owner', 'Scrum Master', 'Developer', 'Team Member', 'Viewer'];

/** Permission groups in the order reviewers expect; unknown groups follow alphabetically. */
export const GROUP_ORDER = ['Projects', 'Tasks', 'Users', 'Reports', 'Settings'];

const compact = (text: string) => text.replace(/\s+/g, '');

/** A role's name in the interface language. The five system roles are translated; custom roles keep the name they were given. */
export const roleDisplayName = (role: { name: string; isSystem?: boolean }): string =>
  (role.isSystem ?? SYSTEM_ROLE_ORDER.includes(role.name))
    ? t(`settings:roles.system.${compact(role.name)}.name`, { defaultValue: role.name })
    : role.name;

/** A role's description; system roles are translated. */
export const roleDisplayDescription = (role: { name: string; description?: string; isSystem?: boolean }): string =>
  (role.isSystem ?? SYSTEM_ROLE_ORDER.includes(role.name))
    ? t(`settings:roles.system.${compact(role.name)}.description`, { defaultValue: role.description ?? '' })
    : (role.description ?? '');

/** Permission catalog entries come from the server in English: show them translated, falling back to the server text. */
export const permissionLabel = (option: PermissionOption): string =>
  t(`settings:permissions.${option.key.replace(':', '_')}`, { defaultValue: option.label });

export const permissionGroupLabel = (group: string): string =>
  t(`settings:permissionGroups.${compact(group)}`, { defaultValue: group });

const systemRank = (name: string) => {
  const index = SYSTEM_ROLE_ORDER.indexOf(name);
  return index === -1 ? SYSTEM_ROLE_ORDER.length : index;
};

/** System roles first (by rank), then custom roles by name. */
export const sortRoles = <T extends Pick<RbacRole, 'name' | 'isSystem'>>(roles: T[]): T[] =>
  [...roles].sort((a, b) => {
    if (a.isSystem !== b.isSystem) return a.isSystem ? -1 : 1;
    if (a.isSystem) return systemRank(a.name) - systemRank(b.name) || a.name.localeCompare(b.name);
    return a.name.localeCompare(b.name);
  });

export const sortedGroups = (catalog: PermissionCatalog): [string, PermissionOption[]][] => {
  const rank = (group: string) => {
    const index = GROUP_ORDER.indexOf(group);
    return index === -1 ? GROUP_ORDER.length : index;
  };
  return Object.entries(catalog)
    .filter(([, options]) => options.length > 0)
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b));
};

/** Case-insensitive match on role name or description. An empty query keeps every role. */
export const filterRoles = <T extends Pick<RbacRole, 'name' | 'description'>>(roles: T[], query: string): T[] => {
  const needle = query.trim().toLowerCase();
  if (!needle) return roles;
  return roles.filter(
    (role) => role.name.toLowerCase().includes(needle) || (role.description || '').toLowerCase().includes(needle),
  );
};

/** Counts members per role id from a workspace payload whose `roleId` may be populated or a bare id. */
export const countMembersByRole = (
  members: { roleId?: string | { _id: string } | null }[],
): Record<string, number> => {
  const counts: Record<string, number> = {};
  for (const member of members) {
    const id = typeof member.roleId === 'string' ? member.roleId : member.roleId?._id;
    if (id) counts[id] = (counts[id] ?? 0) + 1;
  }
  return counts;
};
