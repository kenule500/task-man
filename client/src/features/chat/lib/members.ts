import type { ChannelMember } from '../types';

export interface MemberGroup {
  key: 'online' | 'offline';
  label: string;
  members: ChannelMember[];
}

/**
 * Splits the channel's people into `Online` and `Offline`, each alphabetical (FR-095).
 *
 * The server already sorts the same way; grouping here keeps the order stable if a presence event
 * changes a row after the fetch, and gives each group a heading the panel can render. Pure, so it is
 * unit-testable without a DOM (CON-202).
 */
export const groupMembers = (members: readonly ChannelMember[]): MemberGroup[] => {
  const byName = (a: ChannelMember, b: ChannelMember) => a.name.localeCompare(b.name);
  const online = members.filter(member => member.online).sort(byName);
  const offline = members.filter(member => !member.online).sort(byName);

  const groups: MemberGroup[] = [];
  if (online.length > 0) groups.push({ key: 'online', label: 'Online', members: online });
  if (offline.length > 0) groups.push({ key: 'offline', label: 'Offline', members: offline });
  return groups;
};
