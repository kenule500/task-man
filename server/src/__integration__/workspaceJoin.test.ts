import {
  bearer, createTeam, http, registerUser, startApp, stopApp, systemRoleIds, type TestUser,
} from './harness.js';

beforeAll(startApp);
afterAll(stopApp);

let team: Awaited<ReturnType<typeof createTeam>>;
let outsider: TestUser;

beforeAll(async () => {
  team = await createTeam();
  outsider = await registerUser('Ollie Outsider');
});

const get = (user: TestUser, path: string) => http().get(path).set(bearer(user.token));

describe('workspaces: invite code and joining', () => {
  it('rejects malformed and unknown codes', async () => {
    const join = (inviteCode: unknown) => http().post('/api/workspaces/join').set(bearer(outsider.token)).send({ inviteCode });
    expect((await join('short')).status).toBe(400);
    expect((await join({ $ne: '' })).status).toBe(400);
    expect((await join('ZZZZZZZZZZZZ')).status).toBe(400);
    expect((await join('A'.repeat(12))).status).toBe(404);
  });

  it('joins as Viewer even if the body asks for another role', async () => {
    const joiner = await registerUser('Greedy Joiner');
    const ids = await systemRoleIds(team.owner, team.workspace.slug);
    const res = await http()
      .post('/api/workspaces/join')
      .set(bearer(joiner.token))
      .send({ inviteCode: team.workspace.inviteCode.toLowerCase(), roleId: ids['Product Owner'], role: 'Product Owner' });
    expect(res.status).toBe(200);

    const me = await get(joiner, `/api/auth/currentuser?workspaceSlug=${team.workspace.slug}`);
    expect(me.body.role.name).toBe('Viewer');
    expect(me.body.permissions).not.toContain('tasks:write');
    expect(me.body.permissions).not.toContain('settings:manage');

    const again = await http().post('/api/workspaces/join').set(bearer(joiner.token)).send({ inviteCode: team.workspace.inviteCode });
    expect(again.status).toBe(400);
  });

  it('regenerates the invite code: the old one stops working', async () => {
    const regen = await http().post(`/api/workspaces/${team.workspace.slug}/invite-code`).set(bearer(team.owner.token));
    expect(regen.status).toBe(200);
    expect(regen.body.inviteCode).toMatch(/^[A-F0-9]{12}$/);
    expect(regen.body.inviteCode).not.toBe(team.workspace.inviteCode);

    const late = await registerUser('Late Joiner');
    expect((await http().post('/api/workspaces/join').set(bearer(late.token)).send({ inviteCode: team.workspace.inviteCode })).status).toBe(404);
    expect((await http().post('/api/workspaces/join').set(bearer(late.token)).send({ inviteCode: regen.body.inviteCode })).status).toBe(200);
    team.workspace.inviteCode = regen.body.inviteCode;
  });

  it('only settings:manage can regenerate it', async () => {
    for (const user of [team.viewer, team.developer, outsider]) {
      expect((await http().post(`/api/workspaces/${team.workspace.slug}/invite-code`).set(bearer(user.token))).status).toBe(403);
    }
  });
});

