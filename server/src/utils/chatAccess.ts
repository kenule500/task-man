import type { ChannelKind } from '../models/chatChannelModel.js';

/** The parts of a channel the access rules need. */
export interface ChannelAccessShape {
  kind: ChannelKind;
  participants?: (string | { toString(): string })[] | null;
  archived?: boolean | null;
  /** Set on project channels: the project whose members may read it. */
  project?: (string | { toString(): string }) | null;
}

export type AccessDecision = 'allow' | 'forbidden' | 'not_found';

interface AccessInput {
  channel: ChannelAccessShape;
  userId: string;
  permissions: readonly string[];
  // Writing includes sending, editing, reacting and pinning
  requireWrite?: boolean;
  /**
   * Whether the caller is in the owning project's members list.
   * Left undefined when the caller is not a project channel, or when the caller holds chat:moderate.
   */
  isProjectMember?: boolean;
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
  channel, userId, permissions, requireWrite = false, isProjectMember,
}: AccessInput): AccessDecision => {
  const can = (permission: string) => permissions.includes(permission);

  // Checked first, and for every permission level: a direct conversation is invisible to outsiders.
  if (isDirect(channel) && !isParticipant(channel, userId)) return 'not_found';

  if (!can('chat:read')) return 'forbidden';

  // A project channel belongs to its project's members. `chat:moderate` (the Product Owner capability)
  // sees every one of them (spec FR-037). A non-member gets not_found so existence is not disclosed.
  if (channel.kind === 'project' && !can('chat:moderate') && isProjectMember !== true) {
    return 'not_found';
  }

  if (requireWrite) {
    if (channel.archived) return 'forbidden';
    if (!can('chat:write')) return 'forbidden';
  }

  return 'allow';
};

/**
 * Which channels the caller may see.
 *
 * Project channels are visible to members of the owning project and, for `chat:moderate` holders, all of
 * them. Direct conversations are visible only by participation.
 */
export const visibleChannelClause = (
  permissions: readonly string[],
  userId: string,
  memberProjectIds: readonly string[] = [],
): Record<string, unknown> => {
  const baseKinds: ChannelKind[] = ['team', 'general'];
  const projectClause: Record<string, unknown>[] = permissions.includes('chat:moderate')
    ? [{ kind: 'project' }]
    : memberProjectIds.length > 0
      ? [{ kind: 'project', project: { $in: memberProjectIds } }]
      : [];

  return {
    $or: [
      { kind: { $in: baseKinds } },
      ...projectClause,
      { kind: 'direct', participants: String(userId) },
    ],
  };
};

export const canStartDirect = (permissions: readonly string[]): boolean =>
  permissions.includes('chat:read') && permissions.includes('chat:dm');

export const canModerate = (permissions: readonly string[]): boolean =>
  permissions.includes('chat:moderate');
