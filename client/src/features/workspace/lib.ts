import type { WorkspaceMember, WorkspaceRole } from './types';

export const ROLE_LABELS: Record<WorkspaceRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  member: 'Member',
};

/** Up to two uppercase initials from a display name ("Ada Lovelace" -> "AL"). */
export const getInitials = (name: string): string => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const letters = parts.length === 1 ? parts[0].slice(0, 2) : parts[0][0] + parts[parts.length - 1][0];
  return letters.toUpperCase();
};

export const formatJoinedDate = (iso: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

export const buildInviteLink = (origin: string, inviteCode: string): string =>
  `${origin}/join/${inviteCode}`;

/** Owners and admins can rename the workspace and rotate the invite code. */
export const canManageWorkspace = (members: WorkspaceMember[], userId: string | undefined): boolean => {
  const role = members.find(m => m._id === userId)?.role;
  return role === 'owner' || role === 'admin';
};
