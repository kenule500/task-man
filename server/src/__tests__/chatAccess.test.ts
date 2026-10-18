import { decideChannelAccess, visibleChannelClause } from '../utils/chatAccess.js';

describe('chat channel access', () => {
  it('AC-027: a direct conversation is invisible to everyone except its two participants', () => {
    const channel = { kind: 'direct' as const, participants: ['ada', 'grace'] };

    expect(decideChannelAccess({ channel, userId: 'ada', permissions: ['chat:read'] })).toBe('allow');
    expect(decideChannelAccess({ channel, userId: 'outsider', permissions: ['chat:read'] })).toBe('not_found');
    // Even a moderator gets not_found, so the channel's existence is never disclosed
    expect(decideChannelAccess({ channel, userId: 'admin', permissions: ['chat:read', 'chat:moderate'] }))
      .toBe('not_found');
  });

  it('AC-038: a project channel needs project membership, and hides itself from non-members', () => {
    const channel = { kind: 'project' as const, project: 'p1' };

    expect(decideChannelAccess({ channel, userId: 'ada', permissions: ['chat:read'] })).toBe('not_found');
    expect(decideChannelAccess({ channel, userId: 'ada', permissions: ['chat:read'], isProjectMember: false }))
      .toBe('not_found');
    expect(decideChannelAccess({ channel, userId: 'ada', permissions: ['chat:read'], isProjectMember: true }))
      .toBe('allow');
  });

  it('AC-039: chat:moderate opens every team channel', () => {
    expect(decideChannelAccess({
      channel: { kind: 'project' as const },
      userId: 'po',
      permissions: ['chat:read', 'chat:moderate'],
    })).toBe('allow');
  });

  it('AC-008: writing requires chat:write and a live channel', () => {
    const channel = { kind: 'team' as const };
    expect(decideChannelAccess({ channel, userId: 'ada', permissions: ['chat:read'], requireWrite: true }))
      .toBe('forbidden');
    expect(decideChannelAccess({ channel, userId: 'ada', permissions: ['chat:read', 'chat:write'], requireWrite: true }))
      .toBe('allow');
    expect(decideChannelAccess({
      channel: { kind: 'team' as const, archived: true },
      userId: 'ada',
      permissions: ['chat:read', 'chat:write'],
      requireWrite: true,
    })).toBe('forbidden');
  });

  it('AC-038: the visibility clause scopes project channels to membership, unless moderating', () => {
    const memberClause = visibleChannelClause(['chat:read'], 'ada', ['p1']);
    expect(JSON.stringify(memberClause)).toContain('"project":{"$in":["p1"]}');
    expect(JSON.stringify(memberClause)).toContain('"participants":"ada"');

    const moderatorClause = visibleChannelClause(['chat:read', 'chat:moderate'], 'po', []);
    expect(JSON.stringify(moderatorClause)).toContain('"kind":"project"');
  });
});
