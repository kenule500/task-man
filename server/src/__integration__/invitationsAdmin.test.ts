import mongoose from 'mongoose';
import {
  bearer, createTeam, createWorkspace, emailsTo, http, latestToken, registerUser, startApp, stopApp,
  systemRoleIds, uniqueEmail, unknownId, type SystemRoleName, type TestUser,
} from './harness.js';

beforeAll(startApp);
afterAll(stopApp);

let team: Awaited<ReturnType<typeof createTeam>>;
let slug: string;
let roleIds: Record<SystemRoleName, string>;
let outsider: TestUser;

beforeAll(async () => {
  team = await createTeam();
  slug = team.workspace.slug;
  roleIds = await systemRoleIds(team.owner, slug);
  outsider = await registerUser('Registered Outsider');
});

const invitationsUrl = () => `/api/workspaces/${slug}/invitations`;
const invite = (user: TestUser, email: unknown, roleId: unknown) =>
  http().post(invitationsUrl()).set(bearer(user.token)).send({ email, roleId });
const list = (user: TestUser) => http().get(invitationsUrl()).set(bearer(user.token));

describe('invitations: create', () => {
  it('normalizes the email, returns no token and emails an accept link', async () => {
    const local = uniqueEmail('new').replace('@example.com', '');
    const res = await invite(team.owner, `  ${local.toUpperCase()}@Example.COM `.trim(), roleIds.Developer);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ email: `${local}@example.com`, status: 'pending', roleId: roleIds.Developer });
    expect(res.body.token).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toMatch(/[a-f0-9]{64}/);

    const mails = emailsTo(`${local}@example.com`);
    expect(mails).toHaveLength(1);
    expect(mails[0].subject).toMatch(/invited/i);
    expect(mails[0].text).toMatch(/Developer/);
    expect(latestToken(`${local}@example.com`, 'accept-invite')).toMatch(/^[a-f0-9]{64}$/);
  });

  it('requires users:write', async () => {
    const email = uniqueEmail('blocked');
    expect((await invite(team.viewer, email, roleIds.Viewer)).status).toBe(403);
    expect((await invite(team.developer, email, roleIds.Viewer)).status).toBe(403);
    expect((await invite(outsider, email, roleIds.Viewer)).status).toBe(403);
    expect((await http().post(invitationsUrl()).send({ email, roleId: roleIds.Viewer })).status).toBe(401);
    expect(emailsTo(email)).toHaveLength(0);
    expect((await invite(team.productOwner, email, roleIds.Viewer)).status).toBe(201);
  });

  it('validates the email and role', async () => {
    expect((await invite(team.owner, 'not-an-email', roleIds.Viewer)).status).toBe(400);
    expect((await invite(team.owner, { $ne: '' }, roleIds.Viewer)).status).toBe(400);
    expect((await invite(team.owner, `${'a'.repeat(250)}@example.com`, roleIds.Viewer)).status).toBe(400);
    expect((await invite(team.owner, uniqueEmail('norole'), undefined)).status).toBe(400);
    expect((await invite(team.owner, uniqueEmail('badrole'), 'not-an-id')).status).toBe(404);
    expect((await invite(team.owner, uniqueEmail('ghostrole'), unknownId())).status).toBe(404);
    expect((await invite(team.owner, uniqueEmail('opr'), { $ne: null })).status).toBe(400);
  });

  it('rejects a role that belongs to another workspace', async () => {
    const other = await createWorkspace(outsider, 'Invite Elsewhere');
    const foreign = await http()
      .post(`/api/workspaces/${other.slug}/roles`)
      .set(bearer(outsider.token))
      .send({ name: 'Foreign', permissions: ['tasks:read'] });
    expect((await invite(team.owner, uniqueEmail('x'), foreign.body._id)).status).toBe(404);
  });

  it('only lets the owner invite a Product Owner', async () => {
    expect((await invite(team.productOwner, uniqueEmail('po'), roleIds['Product Owner'])).status).toBe(403);
    expect((await invite(team.owner, uniqueEmail('po'), roleIds['Product Owner'])).status).toBe(201);
  });

  it('does not let a role-limited inviter grant more than they have', async () => {
    const limited = await http()
      .post(`/api/workspaces/${slug}/roles`)
      .set(bearer(team.owner.token))
      .send({ name: 'Inviter Only', permissions: ['users:read', 'users:write', 'projects:read', 'tasks:read'] });
    const inviter = await registerUser('Limited Inviter');
    const join = await http().post('/api/workspaces/join').set(bearer(inviter.token)).send({ inviteCode: team.workspace.inviteCode });
    expect(join.status).toBe(200);
    await http()
      .put(`/api/workspaces/${slug}/members/${inviter.id}/role`)
      .set(bearer(team.owner.token))
      .send({ roleId: limited.body._id });

    expect((await invite(inviter, uniqueEmail('dev'), roleIds.Developer)).status).toBe(403);
    expect((await invite(inviter, uniqueEmail('sm'), roleIds['Scrum Master'])).status).toBe(403);
    // Viewer also carries reports:read, which this role lacks
    expect((await invite(inviter, uniqueEmail('v'), roleIds.Viewer)).status).toBe(403);
  });

  it('refuses to invite someone who is already a member', async () => {
    const res = await invite(team.owner, team.developer.email, roleIds.Viewer);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/already a member/i);
  });

  it('lets you invite a registered user who is not a member yet', async () => {
    const res = await invite(team.owner, outsider.email, roleIds.Viewer);
    expect(res.status).toBe(201);
  });

  it('replaces an earlier pending invitation for the same address', async () => {
    const email = uniqueEmail('twice');
    expect((await invite(team.owner, email, roleIds.Viewer)).status).toBe(201);
    const firstToken = latestToken(email, 'accept-invite')!;
    expect((await invite(team.owner, email, roleIds.Developer)).status).toBe(201);
    const secondToken = latestToken(email, 'accept-invite')!;
    expect(secondToken).not.toBe(firstToken);

    expect((await http().get(`/api/invitations/${firstToken}`)).status).toBe(400);
    expect((await http().get(`/api/invitations/${secondToken}`)).status).toBe(200);
    const pending = (await list(team.owner)).body.filter((i: { email: string }) => i.email === email);
    expect(pending).toHaveLength(1);
  });
});

describe('invitations: list and cancel', () => {
  it('lists pending invitations without their token, for users:read', async () => {
    const email = uniqueEmail('listed');
    await invite(team.owner, email, roleIds['Team Member']);

    const res = await list(team.developer);
    expect(res.status).toBe(200);
    const mine = res.body.find((i: { email: string }) => i.email === email);
    expect(mine).toBeDefined();
    expect(mine.token).toBeUndefined();
    expect(mine.roleId.name).toBe('Team Member');
    expect(mine.invitedBy.name).toBe('Olivia Owner');
    expect(JSON.stringify(res.body)).not.toMatch(/[a-f0-9]{64}/);

    expect((await list(team.viewer)).status).toBe(403);
    expect((await list(outsider)).status).toBe(403);
  });

  it('hides expired invitations', async () => {
    const email = uniqueEmail('stale');
    await invite(team.owner, email, roleIds.Viewer);
    await mongoose.connection.collection('invitations').updateOne({ email }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    const res = await list(team.owner);
    expect(res.body.map((i: { email: string }) => i.email)).not.toContain(email);
  });

  it('cancels a pending invitation, once', async () => {
    const email = uniqueEmail('cancel');
    const created = await invite(team.owner, email, roleIds.Viewer);
    const token = latestToken(email, 'accept-invite')!;
    const url = `${invitationsUrl()}/${created.body._id}`;

    expect((await http().delete(url).set(bearer(team.developer.token))).status).toBe(403);
    expect((await http().delete(url).set(bearer(team.owner.token))).status).toBe(200);
    expect((await http().delete(url).set(bearer(team.owner.token))).status).toBe(404);
    expect((await list(team.owner)).body.map((i: { email: string }) => i.email)).not.toContain(email);

    const preview = await http().get(`/api/invitations/${token}`);
    expect(preview.status).toBe(400);
  });

  it('404s odd ids and invitations of another workspace', async () => {
    const email = uniqueEmail('scoped');
    const created = await invite(team.owner, email, roleIds.Viewer);
    expect((await http().delete(`${invitationsUrl()}/not-an-id`).set(bearer(team.owner.token))).status).toBe(404);
    expect((await http().delete(`${invitationsUrl()}/${unknownId()}`).set(bearer(team.owner.token))).status).toBe(404);

    const other = await createWorkspace(outsider, 'Cancel Elsewhere');
    const cross = await http()
      .delete(`/api/workspaces/${other.slug}/invitations/${created.body._id}`)
      .set(bearer(outsider.token));
    expect(cross.status).toBe(404);
    // still pending in its own workspace
    expect((await list(team.owner)).body.map((i: { email: string }) => i.email)).toContain(email);
  });
});
