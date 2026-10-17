// ============================================================
// Permission Catalog
// Every permission the system understands. Add new ones here
// and they become available to every role automatically.
// ============================================================

export const PERMISSIONS = {
  'projects:read':   { label: 'View projects',           group: 'Projects' },
  'projects:write':  { label: 'Create/edit projects',    group: 'Projects' },
  'projects:delete': { label: 'Delete projects',         group: 'Projects' },

  'tasks:read':      { label: 'View tasks',              group: 'Tasks' },
  'tasks:write':     { label: 'Create/edit tasks',       group: 'Tasks' },
  'tasks:delete':    { label: 'Delete tasks',            group: 'Tasks' },

  'users:read':      { label: 'View team members',       group: 'Users' },
  'users:write':     { label: 'Invite/remove members',   group: 'Users' },

  'reports:read':    { label: 'View analytics',          group: 'Reports' },

  'chat:read':       { label: 'View channels and messages', group: 'Chat' },
  'chat:write':      { label: 'Send, edit and pin messages', group: 'Chat' },
  'chat:dm':         { label: 'Start direct messages',      group: 'Chat' },
  'chat:moderate':   { label: 'Delete any message',         group: 'Chat' },

  'settings:manage': { label: 'Change workspace settings', group: 'Settings' },
} as const;

export type PermissionKey = keyof typeof PERMISSIONS;

// ============================================================
// System Roles
// These are seeded on server startup. isSystem: true → cannot
// be edited or deleted by users.
// ============================================================

export interface SystemRoleDefinition {
  name: string;
  description: string;
  permissions: PermissionKey[];
}

export const SYSTEM_ROLES: SystemRoleDefinition[] = [
  {
    name: 'Product Owner',
    description: 'Full control over the product, backlog, team, and settings.',
    permissions: [
      'projects:read', 'projects:write', 'projects:delete',
      'tasks:read', 'tasks:write', 'tasks:delete',
      'users:read', 'users:write',
      'reports:read',
      'chat:read', 'chat:write', 'chat:dm', 'chat:moderate',
      'settings:manage',
    ],
  },
  {
    name: 'Scrum Master',
    description: 'Facilitates the team and removes blockers.',
    permissions: [
      'projects:read', 'projects:write',
      'tasks:read', 'tasks:write',
      'users:read',
      'reports:read',
      'chat:read', 'chat:write', 'chat:dm',
    ],
  },
  {
    name: 'Developer',
    description: 'Builds and updates assigned tasks and projects.',
    permissions: [
      'projects:read',
      'tasks:read', 'tasks:write',
      'users:read',
      'reports:read',
      'chat:read', 'chat:write', 'chat:dm',
    ],
  },
  {
    name: 'Team Member',
    description: 'Works on assigned tasks.',
    permissions: [
      'projects:read',
      'tasks:read', 'tasks:write',
      'reports:read',
      'chat:read', 'chat:write', 'chat:dm',
    ],
  },
  {
    name: 'Viewer',
    description: 'Read-only access to the workspace.',
    permissions: [
      'projects:read',
      'tasks:read',
      'reports:read',
      'chat:read',
    ],
  },
];

// ============================================================
// Derived Actions
// Actions are computed from permissions for UI convenience.
// ============================================================

export const deriveActions = (permissions: string[]): string[] => {
  const actions = new Set<string>();
  for (const p of permissions) {
    const [, action] = p.split(':');
    if (action === 'read')   actions.add('read');
    if (action === 'write')  { actions.add('create'); actions.add('update'); }
    if (action === 'delete') actions.add('delete');
    if (action === 'manage') actions.add('manage');
    if (action === 'moderate') actions.add('moderate');
  }
  return Array.from(actions);
};

export const hasPermission = (
  userPermissions: string[],
  required: PermissionKey
): boolean => {
  return userPermissions.includes(required);
};