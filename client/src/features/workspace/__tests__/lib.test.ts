import { buildInviteLink, canManageWorkspace, formatJoinedDate, getInitials } from '../lib';
import type { WorkspaceMember } from '../types';

const member = (_id: string, role: WorkspaceMember['role']): WorkspaceMember => ({
  _id, role, name: _id, email: `${_id}@x.com`, avatarUrl: '', jobTitle: '', joinedAt: '2026-01-01T00:00:00.000Z',
});

describe('workspace helpers', () => {
  it('builds initials', () => {
    expect(getInitials('Ada Lovelace')).toBe('AL');
    expect(getInitials('  cher ')).toBe('CH');
    expect(getInitials('Jean Luc Picard')).toBe('JP');
    expect(getInitials('')).toBe('?');
  });

  it('formats the joined date and tolerates bad input', () => {
    expect(formatJoinedDate('2026-03-15T12:00:00.000Z')).toBe('Mar 15, 2026');
    expect(formatJoinedDate('nope')).toBe('');
  });

  it('builds the invite link', () => {
    expect(buildInviteLink('https://app.test', 'ABC123')).toBe('https://app.test/join/ABC123');
  });

  it('lets only owners and admins manage the workspace', () => {
    const members = [member('o', 'owner'), member('a', 'admin'), member('m', 'member')];
    expect(canManageWorkspace(members, 'o')).toBe(true);
    expect(canManageWorkspace(members, 'a')).toBe(true);
    expect(canManageWorkspace(members, 'm')).toBe(false);
    expect(canManageWorkspace(members, undefined)).toBe(false);
  });
});
