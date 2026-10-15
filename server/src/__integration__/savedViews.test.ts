import {
  bearer, createTeam, createWorkspace, http, registerUser, startApp, stopApp, unknownId, type TestUser,
} from './harness.js';

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

const url = (id = '') => `/api/workspaces/${slug}/views${id ? `/${id}` : ''}`;
const list = (user: TestUser) => http().get(url()).set(bearer(user.token));
const save = (user: TestUser, body: Record<string, unknown>) => http().post(url()).set(bearer(user.token)).send(body);
const patch = (user: TestUser, id: string, body: Record<string, unknown>) => http().patch(url(id)).set(bearer(user.token)).send(body);
const remove = (user: TestUser, id: string) => http().delete(url(id)).set(bearer(user.token));
const namesFor = async (user: TestUser): Promise<string[]> => (await list(user)).body.map((view: { name: string }) => view.name);

describe('saved views: access', () => {
  it('requires a session and workspace membership', async () => {
    expect((await http().get(url())).status).toBe(401);
    expect((await list(outsider)).status).toBe(403);
    expect((await save(outsider, { name: 'x' })).status).toBe(403);
  });

  it('lets a viewer (tasks:read) save a view', async () => {
    const res = await save(team.viewer, { name: 'Viewer pending', view: 'board', query: 'status=pending' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: 'Viewer pending', view: 'board', query: 'status=pending', shared: false, mine: true });
    expect(res.body.owner).toMatchObject({ _id: team.viewer.id, name: 'Vera Viewer' });
  });
});

describe('saved views: create and validate', () => {
  it('normalises the query and defaults to a private list view', async () => {
    const res = await save(team.developer, { name: '  My bugs  ', query: '?type=bug&assignedToMe=1' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: 'My bugs', view: 'list', query: 'type=bug&assignedToMe=1', shared: false });
  });

  it('rejects bad input', async () => {
    expect((await save(team.developer, {})).status).toBe(400);
    expect((await save(team.developer, { name: 'x'.repeat(61) })).status).toBe(400);
    expect((await save(team.developer, { name: 'ok', view: 'gantt' })).status).toBe(400);
    expect((await save(team.developer, { name: 'ok', query: 'task=abc' })).status).toBe(400);
    expect((await save(team.developer, { name: 'ok', query: `q=${'a'.repeat(1001)}` })).status).toBe(400);
    expect((await save(team.developer, { name: 'ok', shared: 'yes' })).status).toBe(400);
  });
});

describe('saved views: visibility', () => {
  it('shows private views to their owner only and shared views to everyone in the workspace', async () => {
    await save(team.developer, { name: 'Dev private' });
    await save(team.developer, { name: 'Dev shared', shared: true });

    expect(await namesFor(team.developer)).toEqual(expect.arrayContaining(['Dev private', 'Dev shared']));

    const others = await list(team.productOwner);
    const names = others.body.map((view: { name: string }) => view.name);
    expect(names).toContain('Dev shared');
    expect(names).not.toContain('Dev private');
    expect(others.body.find((view: { name: string }) => view.name === 'Dev shared')).toMatchObject({ mine: false });
  });

  it('hides a private view from other members (404 on change)', async () => {
    const created = await save(team.developer, { name: 'Secret view' });
    expect((await patch(team.productOwner, created.body._id, { name: 'Peek' })).status).toBe(404);
    expect((await remove(team.owner, created.body._id)).status).toBe(404);
    expect(await namesFor(team.developer)).toContain('Secret view');
  });
});

describe('saved views: update and delete', () => {
  it('lets the owner rename, re-filter and share', async () => {
    const created = await save(team.developer, { name: 'Draft' });
    const res = await patch(team.developer, created.body._id, { name: 'Final', view: 'calendar', query: 'priority=high', shared: true });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: 'Final', view: 'calendar', query: 'priority=high', shared: true });
  });

  it('keeps other members from editing or deleting a shared view', async () => {
    const created = await save(team.developer, { name: 'Team board', shared: true });
    expect((await patch(team.viewer, created.body._id, { name: 'Hijack' })).status).toBe(403);
    expect((await remove(team.viewer, created.body._id)).status).toBe(403);
  });

  it('lets settings:manage rename and delete shared views, but not change who sees them', async () => {
    const created = await save(team.developer, { name: 'Needs cleanup', shared: true });
    expect((await patch(team.owner, created.body._id, { shared: false })).status).toBe(403);
    const renamed = await patch(team.owner, created.body._id, { name: 'Cleaned up' });
    expect(renamed.status).toBe(200);
    expect(renamed.body.name).toBe('Cleaned up');
    expect((await remove(team.owner, created.body._id)).status).toBe(200);
    expect(await namesFor(team.developer)).not.toContain('Cleaned up');
  });

  it('lets the owner delete', async () => {
    const created = await save(team.developer, { name: 'Short lived' });
    expect((await remove(team.developer, created.body._id)).status).toBe(200);
    expect(await namesFor(team.developer)).not.toContain('Short lived');
  });

  it('answers 404 for unknown and malformed ids', async () => {
    expect((await patch(team.developer, unknownId(), { name: 'x' })).status).toBe(404);
    expect((await remove(team.developer, unknownId())).status).toBe(404);
    expect((await remove(team.developer, 'nope')).status).toBe(404);
  });

  it('does not leak views across workspaces', async () => {
    const other = await registerUser('Oscar Other');
    const otherWorkspace = await createWorkspace(other, 'Other space');
    const res = await http().get(`/api/workspaces/${otherWorkspace.slug}/views`).set(bearer(other.token));
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});
