import mongoose from 'mongoose';
import {
  bearer, createWorkspace, http, latestToken, registerUser, startApp, stopApp, systemRoleIds, type SystemRoleName,
  type TestUser, type TestWorkspace,
} from './harness.js';

beforeAll(startApp);
afterAll(stopApp);

let owner: TestUser;
let workspace: TestWorkspace;
let roleIds: Record<SystemRoleName, string>;
let accepter: TestUser;
let bystander: TestUser;
let drifter: TestUser;

beforeAll(async () => {
  owner = await registerUser('Ivy Inviter');
  workspace = await createWorkspace(owner, 'Invite Flow HQ');
  roleIds = await systemRoleIds(owner, workspace.slug);
  accepter = await registerUser('Alice Accepter');
  bystander = await registerUser('Bob Bystander');
  drifter = await registerUser('Dana Drifter');
});

const invitationsUrl = () => `/api/workspaces/${workspace.slug}/invitations`;
const invite = (email: string, roleId: string) =>
  http().post(invitationsUrl()).set(bearer(owner.token)).send({ email, roleId });
const preview = (token: string) => http().get(`/api/invitations/${token}`);
const accept = (token: string, user?: TestUser) => {
  const req = http().post(`/api/invitations/${token}/accept`);
  return user ? req.set(bearer(user.token)) : req;
};
const decline = (token: string, user?: TestUser) => {
  const req = http().post(`/api/invitations/${token}/decline`);
  return user ? req.set(bearer(user.token)) : req;
};
const isMember = async (user: TestUser) => {
  const res = await http().get(`/api/workspaces/${workspace.slug}`).set(bearer(user.token));
  return res.status === 200;
};

describe('invitations: preview, accept, decline', () => {
  let token: string;

  it('shows a public preview with the address masked', async () => {
    expect((await invite(accepter.email, roleIds.Developer)).status).toBe(201);
    token = latestToken(accepter.email, 'accept-invite')!;

    const res = await preview(token);
    expect(res.status).toBe(200);
    expect(res.body.workspace.name).toBe('Invite Flow HQ');
    expect(res.body.role.name).toBe('Developer');
    expect(res.body.invitedBy.name).toBe('Ivy Inviter');
    expect(res.body.email).toMatch(/^.\*\*\*@example\.com$/);
    expect(res.body.email).not.toContain(accepter.email.split('@')[0].slice(1));
    expect(JSON.stringify(res.body)).not.toContain(owner.email);
  });

  it('404s unknown and malformed tokens', async () => {
    expect((await preview('0'.repeat(64))).status).toBe(404);
    expect((await preview('garbage')).status).toBe(404);
    expect((await preview(`${'0'.repeat(63)}$ne`)).status).toBe(404);
  });

  it('needs a login to accept or decline', async () => {
    expect((await accept(token)).status).toBe(401);
    expect((await decline(token)).status).toBe(401);
  });

  it('refuses the wrong account and leaves the invitation usable', async () => {
    const wrong = await accept(token, bystander);
    expect(wrong.status).toBe(403);
    expect(wrong.body.message).toMatch(/different email/i);
    expect((await decline(token, bystander)).status).toBe(403);
    expect(await isMember(bystander)).toBe(false);
    expect((await preview(token)).status).toBe(200);
  });

  it('adds the right account with the invited role, once', async () => {
    const res = await accept(token, accepter);
    expect(res.status).toBe(200);
    expect(res.body.workspace.slug).toBe(workspace.slug);

    const me = await http().get(`/api/auth/currentuser?workspaceSlug=${workspace.slug}`).set(bearer(accepter.token));
    expect(me.body.role.name).toBe('Developer');
    const profile = await http().get('/api/profile').set(bearer(accepter.token));
    expect(profile.body.workspaces.map((w: { slug: string }) => w.slug)).toContain(workspace.slug);
    expect(profile.body.activeWorkspace).toBe(workspace.id);

    const members = await http().get(`/api/workspaces/${workspace.slug}/members`).set(bearer(owner.token));
    expect(members.body.filter((m: { _id: string }) => m._id === accepter.id)).toHaveLength(1);

    const again = await accept(token, accepter);
    expect(again.status).toBe(400);
    expect(again.body.message).toMatch(/already accepted/i);
    expect((await preview(token)).status).toBe(400);
  });
});

describe('invitations: decline, cancel, replace, expire', () => {
  it('declines an invitation, which then cannot be accepted', async () => {
    await invite(drifter.email, roleIds.Viewer);
    const token = latestToken(drifter.email, 'accept-invite')!;
    const res = await decline(token, drifter);
    expect(res.status).toBe(200);
    const late = await accept(token, drifter);
    expect(late.status).toBe(400);
    expect(late.body.message).toMatch(/already declined/i);
    expect(await isMember(drifter)).toBe(false);
  });

  it('cannot accept a cancelled invitation', async () => {
    const created = await invite(drifter.email, roleIds.Viewer);
    const token = latestToken(drifter.email, 'accept-invite')!;
    expect((await http().delete(`${invitationsUrl()}/${created.body._id}`).set(bearer(owner.token))).status).toBe(200);
    const res = await accept(token, drifter);
    expect(res.status).toBe(400);
    expect(await isMember(drifter)).toBe(false);
  });

  it('invalidates the old link when the address is invited again', async () => {
    await invite(drifter.email, roleIds.Viewer);
    const oldToken = latestToken(drifter.email, 'accept-invite')!;
    await invite(drifter.email, roleIds['Team Member']);
    const newToken = latestToken(drifter.email, 'accept-invite')!;
    expect((await accept(oldToken, drifter)).status).toBe(400);
    expect(await isMember(drifter)).toBe(false);
    // keep the fresh one for the next test
    expect((await preview(newToken)).status).toBe(200);
    expect((await preview(newToken)).body.role.name).toBe('Team Member');
  });

  it('rejects and expires an invitation past its deadline', async () => {
    const token = latestToken(drifter.email, 'accept-invite')!;
    await mongoose.connection.collection('invitations').updateMany(
      { email: drifter.email, status: 'pending' },
      { $set: { expiresAt: new Date(Date.now() - 60_000) } },
    );
    const view = await preview(token);
    expect(view.status).toBe(400);
    expect(view.body.message).toMatch(/expired/i);

    const stored = await mongoose.connection.collection('invitations').findOne({ email: drifter.email, status: 'expired' });
    expect(stored).not.toBeNull();
    const res = await accept(token, drifter);
    expect(res.status).toBe(400);
    expect(await isMember(drifter)).toBe(false);
  });

  it('answers 409 when the invited custom role has been deleted meanwhile', async () => {
    const role = await http()
      .post(`/api/workspaces/${workspace.slug}/roles`)
      .set(bearer(owner.token))
      .send({ name: 'Short Lived', permissions: ['tasks:read'] });
    expect((await invite(drifter.email, role.body._id)).status).toBe(201);
    const token = latestToken(drifter.email, 'accept-invite')!;
    expect((await http().delete(`/api/workspaces/${workspace.slug}/roles/${role.body._id}`).set(bearer(owner.token))).status).toBe(200);

    const res = await accept(token, drifter);
    expect(res.status).toBe(409);
    expect(await isMember(drifter)).toBe(false);
  });
});
