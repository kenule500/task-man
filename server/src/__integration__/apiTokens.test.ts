import mongoose from 'mongoose';
import {
  bearer, createTask, createTeam, http, registerUser, startApp, stopApp, createWorkspace, unknownId, type TestUser,
} from './harness.js';
import { hashApiToken } from '../utils/apiTokens.js';

beforeAll(startApp);
afterAll(stopApp);

let team: Awaited<ReturnType<typeof createTeam>>;
let slug: string;
let outsider: TestUser;

beforeAll(async () => {
  team = await createTeam();
  slug = team.workspace.slug;
  outsider = await registerUser('Nina Notmember');
});

const url = (id = '') => `/api/workspaces/${slug}/tokens${id ? `/${id}` : ''}`;
const create = (user: TestUser, body: Record<string, unknown> = {}, workspaceSlug = slug) =>
  http().post(`/api/workspaces/${workspaceSlug}/tokens`).set(bearer(user.token))
    .send({ name: 'CI', scopes: ['tasks:read'], ...body });
const list = (user: TestUser) => http().get(url()).set(bearer(user.token));
const revoke = (user: TestUser, id: string) => http().delete(url(id)).set(bearer(user.token));
const getTasks = (token: string, workspaceSlug = slug) =>
  http().get(`/api/workspaces/${workspaceSlug}/tasks`).set(bearer(token));

describe('api tokens: create and list', () => {
  it('shows the token once and never again', async () => {
    const created = await create(team.developer, { name: 'Laptop', expiresInDays: 30 });
    expect(created.status).toBe(201);
    expect(created.body.token).toMatch(/^tm_[0-9A-Za-z]{40}$/);
    expect(created.body).toMatchObject({ name: 'Laptop', scopes: ['tasks:read'], prefix: created.body.token.slice(3, 11) });
    expect(new Date(created.body.expiresAt).getTime()).toBeGreaterThan(Date.now());

    const listed = await list(team.developer);
    expect(listed.status).toBe(200);
    const mine = listed.body.find((token: { _id: string }) => token._id === created.body._id);
    expect(mine).toBeDefined();
    expect(mine.token).toBeUndefined();
    expect(mine.tokenHash).toBeUndefined();
    expect(JSON.stringify(listed.body)).not.toContain(created.body.token);
  });

  it('stores only the hash', async () => {
    const created = await create(team.developer, { name: 'Hash check' });
    const stored = await mongoose.connection.collection('apitokens').findOne({ _id: new mongoose.Types.ObjectId(created.body._id) });
    expect(stored?.tokenHash).toBe(hashApiToken(created.body.token));
    expect(JSON.stringify(stored)).not.toContain(created.body.token);
  });

  it('lists only your own tokens', async () => {
    await create(team.viewer, { name: 'Viewer token' });
    const names = (await list(team.developer)).body.map((token: { name: string }) => token.name);
    expect(names).not.toContain('Viewer token');
  });

  it('requires membership and a session', async () => {
    expect((await http().get(url())).status).toBe(401);
    expect((await list(outsider)).status).toBe(403);
    expect((await create(outsider)).status).toBe(403);
  });

  it('validates the input', async () => {
    expect((await create(team.developer, { name: '' })).status).toBe(400);
    expect((await create(team.developer, { name: 'x'.repeat(61) })).status).toBe(400);
    expect((await create(team.developer, { scopes: [] })).status).toBe(400);
    expect((await create(team.developer, { scopes: ['nope:read'] })).status).toBe(400);
    expect((await create(team.developer, { expiresInDays: 366 })).status).toBe(400);
    expect((await create(team.developer, { expiresInDays: 0 })).status).toBe(400);
    expect((await create(team.developer, { expiresAt: '2000-01-01' })).status).toBe(400);
    expect((await create(team.developer, { expiresInDays: null })).status).toBe(201);
  });

  it('refuses scopes the creator does not have', async () => {
    const res = await create(team.viewer, { scopes: ['tasks:read', 'tasks:write'] });
    expect(res.status).toBe(403);
    expect((await create(team.developer, { scopes: ['settings:manage'] })).status).toBe(403);
    expect((await create(team.productOwner, { scopes: ['settings:manage'] })).status).toBe(201);
  });

  it('allows at most 10 active tokens per user per workspace', async () => {
    const user = await registerUser('Max Tokens');
    const other = await createWorkspace(user, 'Token Limit Co');
    for (let i = 0; i < 10; i += 1) {
      expect((await create(user, { name: `t${i}` }, other.slug)).status).toBe(201);
    }
    const eleventh = await create(user, { name: 'one too many' }, other.slug);
    expect(eleventh.status).toBe(400);
    const first = (await http().get(`/api/workspaces/${other.slug}/tokens`).set(bearer(user.token))).body[0];
    await http().delete(`/api/workspaces/${other.slug}/tokens/${first._id}`).set(bearer(user.token));
    expect((await create(user, { name: 'now fits' }, other.slug)).status).toBe(201);
  });
});

describe('api tokens: using a token', () => {
  it('reads tasks with a bearer token', async () => {
    const task = await createTask(team.owner, slug, { title: 'Visible to token' });
    const { body } = await create(team.developer, { scopes: ['tasks:read'] });
    const res = await getTasks(body.token);
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).toContain(task._id);
  });

  it('returns 403 when the scope is missing', async () => {
    const { body } = await create(team.developer, { scopes: ['tasks:read'] });
    const res = await http().post(`/api/workspaces/${slug}/tasks`).set(bearer(body.token))
      .send({ title: 'Nope', deadline: '2030-06-15' });
    expect(res.status).toBe(403);
    const readWrite = await create(team.developer, { scopes: ['tasks:read', 'tasks:write'] });
    const ok = await http().post(`/api/workspaces/${slug}/tasks`).set(bearer(readWrite.body.token))
      .send({ title: 'Created by token', deadline: '2030-06-15' });
    expect(ok.status).toBe(201);
  });

  it('is limited to its own workspace', async () => {
    const { body } = await create(team.owner, { scopes: ['tasks:read'] });
    const second = await createWorkspace(team.owner, 'Second Workspace');
    expect((await getTasks(body.token, second.slug)).status).toBe(403);
    expect((await getTasks(body.token)).status).toBe(200);
  });

  it('never exceeds the owner current role', async () => {
    const { body } = await create(team.productOwner, { scopes: ['tasks:read', 'settings:manage'] });
    expect((await http().get(`/api/workspaces/${slug}/webhooks`).set(bearer(body.token))).status).toBe(403);
    const activity = await http().get(`/api/workspaces/${slug}/activity`).set(bearer(body.token));
    expect(activity.status).toBe(200);
  });

  it('cannot reach account or workspace-management routes', async () => {
    const { body } = await create(team.owner, { scopes: ['tasks:read', 'settings:manage'] });
    expect((await http().get('/api/profile').set(bearer(body.token))).status).toBe(403);
    expect((await http().put('/api/profile/password').set(bearer(body.token)).send({})).status).toBe(403);
    expect((await http().get('/api/profile/sessions').set(bearer(body.token))).status).toBe(403);
    expect((await http().get('/api/workspaces').set(bearer(body.token))).status).toBe(403);
    expect((await http().get('/api/auth/currentuser').set(bearer(body.token))).status).toBe(403);
    expect((await http().put(`/api/workspaces/${slug}/activate`).set(bearer(body.token))).status).toBe(403);
    expect((await http().get(`/api/workspaces/${slug}/webhooks`).set(bearer(body.token))).status).toBe(403);
  });

  it('cannot create or list tokens with a token', async () => {
    const { body } = await create(team.developer, { scopes: ['tasks:read'] });
    const made = await http().post(url()).set(bearer(body.token)).send({ name: 'child', scopes: ['tasks:read'] });
    expect(made.status).toBe(403);
    expect((await http().get(url()).set(bearer(body.token))).status).toBe(403);
    expect((await http().delete(url(body._id)).set(bearer(body.token))).status).toBe(403);
  });

  it('rejects unknown, malformed and look-alike tokens with 401', async () => {
    expect((await getTasks(`tm_${'a'.repeat(40)}`)).status).toBe(401);
    expect((await getTasks('tm_short')).status).toBe(401);
    expect((await getTasks('tm_')).status).toBe(401);
  });

  it('records last use', async () => {
    const { body } = await create(team.developer, { name: 'Used' });
    expect((await list(team.developer)).body.find((t: { _id: string }) => t._id === body._id).lastUsedAt).toBeNull();
    await getTasks(body.token);
    const used = (await list(team.developer)).body.find((t: { _id: string }) => t._id === body._id);
    expect(used.lastUsedAt).not.toBeNull();
  });
});

describe('api tokens: revoke and expire', () => {
  it('stops working once revoked', async () => {
    const { body } = await create(team.developer, { name: 'To revoke' });
    expect((await getTasks(body.token)).status).toBe(200);
    expect((await revoke(team.developer, body._id)).status).toBe(200);
    expect((await getTasks(body.token)).status).toBe(401);
    expect((await list(team.developer)).body.map((t: { _id: string }) => t._id)).not.toContain(body._id);
    expect((await revoke(team.developer, body._id)).status).toBe(404);
  });

  it('stops working once expired', async () => {
    const { body } = await create(team.developer, { name: 'Short lived', expiresInDays: 1 });
    expect((await getTasks(body.token)).status).toBe(200);
    await mongoose.connection.collection('apitokens').updateOne(
      { _id: new mongoose.Types.ObjectId(body._id) },
      { $set: { expiresAt: new Date(Date.now() - 1000) } },
    );
    expect((await getTasks(body.token)).status).toBe(401);
  });

  it('lets only the owner of a token, or a settings manager, revoke it', async () => {
    const { body } = await create(team.developer, { name: 'Dev token' });
    expect((await revoke(team.viewer, body._id)).status).toBe(404);
    expect((await getTasks(body.token)).status).toBe(200);
    expect((await revoke(team.owner, body._id)).status).toBe(200);
    expect((await getTasks(body.token)).status).toBe(401);
    expect((await revoke(team.developer, 'not-an-id')).status).toBe(404);
    expect((await revoke(team.developer, unknownId())).status).toBe(404);
  });

  it('records token.created and token.revoked in the activity log', async () => {
    const { body } = await create(team.developer, { name: 'Audited' });
    await revoke(team.developer, body._id);
    const log = await http().get(`/api/workspaces/${slug}/activity?area=token`).set(bearer(team.owner.token));
    expect(log.status).toBe(200);
    expect(JSON.stringify(log.body)).toContain('Audited');
    expect(JSON.stringify(log.body)).not.toContain(body.token);
    const revoked = await http().get(`/api/workspaces/${slug}/activity?area=token`).set(bearer(team.owner.token));
    expect(JSON.stringify(revoked.body)).toContain('Audited');
  });
});
