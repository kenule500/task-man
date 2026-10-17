import type { ChannelKind } from '../models/chatChannelModel.js';

/** The parts of a channel the access rules need. */
export interface ChannelAccessShape {
  kind: ChannelKind;
  participants?: (string | { toString(): string })[] | null;
  archived?: boolean | null;
}

export type AccessDecision = 'allow' | 'forbidden' | 'not_found';

interface AccessInput {
  channel: ChannelAccessShape;
  userId: string;
  permissions: readonly string[];
  // Writing includes sending, editing, reacting and pinning
  requireWrite?: boolean;
}

const idsOf = (participants: ChannelAccessShape['participants']): string[] =>
  (participants ?? []).map(String);

export const isDirect = (channel: ChannelAccessShape): boolean => channel.kind === 'direct';

export const isParticipant = (channel: ChannelAccessShape, userId: string): boolean =>
  idsOf(channel.participants).includes(String(userId));

/**
 * Decides what a caller may do with a channel.
 *
 * `not_found` is reserved for a direct channel the caller is not part of, so its existence is never
 * disclosed — including to administrators (spec AC-027). Everything else the caller may not see is
 * `forbidden`, which the controller turns into 403.
 */
export const decideChannelAccess = ({
  channel, userId, permissions, requireWrite = false,
}: AccessInput): AccessDecision => {
  const can = (permission: string) => permissions.includes(permission);

  // Checked first, and for every permission level: a direct conversation is invisible to outsiders.
  if (isDirect(channel) && !isParticipant(channel, userId)) return 'not_found';

  if (!can('chat:read')) return 'forbidden';
  if (channel.kind === 'project' && !can('projects:read')) return 'forbidden';

  if (requireWrite) {
    if (channel.archived) return 'forbidden';
    if (!can('chat:write')) return 'forbidden';
  }

  return 'allow';
};

/**
 * Project channels follow projects: a member who cannot read projects cannot see them.
 * Direct conversations are only visible to their two participants, so they are added by participant
 * rather than by kind.
 */
export const visibleChannelClause = (
  permissions: readonly string[],
  userId: string,
): Record<string, unknown> => {
  const kinds: ChannelKind[] = ['team', 'general'];
  if (permissions.includes('projects:read')) kinds.push('project');
  return {
    $or: [
      { kind: { $in: kinds } },
      { kind: 'direct', participants: String(userId) },
    ],
  };
};

export const canStartDirect = (permissions: readonly string[]): boolean =>
  permissions.includes('chat:read') && permissions.includes('chat:dm');

export const canModerate = (permissions: readonly string[]): boolean =>
  permissions.includes('chat:moderate');
