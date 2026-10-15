import {
  bearer, createTask, createTeam, createWorkspace, http, joinAs, registerUser, startApp, stopApp, uniqueEmail, type TestUser,
} from './harness.js';

beforeAll(startApp);
afterAll(stopApp);

type Team = Awaited<ReturnType<typeof createTeam>>;
let team: Team;
let outsider: TestUser;
let creator: TestUser;

beforeAll(async () => {
  team = await createTeam();
  outsider = await registerUser('Ollie Outsider');
  creator = await registerUser('Creator');
});

const get = (user: TestUser, path: string) => http().get(path).set(bearer(user.token));

describe('workspaces: create and list', () => {
  it('requires authentication', async () => {
    expect((await http().post('/api/workspaces').send({ name: 'Nope' })).status).toBe(401);
    expect((await http().get('/api/workspaces')).status).toBe(401);
  });

  it('creates a workspace with the creator as Product Owner and a 12-hex invite code', async () => {
    const owner = creator;
    const res = await http().post('/api/workspaces').set(bearer(owner.token)).send({ name: '  Acme Corp!  ' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: 'Acme Corp!', slug: 'acme-corp', owner: owner.id });
    expect(res.body.inviteCode).toMatch(/^[A-F0-9]{12}$/);
    expect(res.body.members).toHaveLength(1);
    expect(res.body.members[0].user).toBe(owner.id);

    const me = await get(owner, '/api/auth/currentuser?workspaceSlug=acme-corp');
    expect(me.body.role.name).toBe('Product Owner');
  });

  it('rejects an empty or missing name', async () => {
    const owner = creator;
    for (const body of [{}, { name: '' }, { name: '   ' }]) {
      expect((await http().post('/api/workspaces').set(bearer(owner.token)).send(body)).status).toBe(400);
    }
  });

  it('gives workspaces with the same name distinct slugs', async () => {
    const owner = creator;
    const first = await createWorkspace(owner, 'Twin Name');
    const second = await createWorkspace(owner, 'Twin Name');
    expect(first.slug).toBe('twin-name');
    expect(second.slug).toBe('twin-name-1');
  });

  it('falls back to a generic slug for names without ASCII letters', async () => {
    const owner = creator;
    const created = await createWorkspace(owner, '日本語');
    expect(created.slug).toMatch(/^workspace(-\d+)?$/);
  });

  // createWorkspace calls name.trim() unguarded (TypeError on objects) and does not map the
  // Mongoose maxlength(60) ValidationError: both end as 500.
  it('rejects a non-string name with a 400, not a 500', async () => {
    const owner = creator;
    const res = await http().post('/api/workspaces').set(bearer(owner.token)).send({ name: { a: 1 } });
    expect(res.status).toBe(400);
  });

  it('rejects a name over 60 characters with a 400, not a 500', async () => {
    const owner = creator;
    const res = await http().post('/api/workspaces').set(bearer(owner.token)).send({ name: 'w'.repeat(61) });
    expect(res.status).toBe(400);
  });

  it('lists only the workspaces the user belongs to, without password fields', async () => {
    const mine = await get(team.developer, '/api/workspaces');
    expect(mine.status).toBe(200);
    expect(mine.body.map((w: { slug: string }) => w.slug)).toEqual([team.workspace.slug]);
    expect(JSON.stringify(mine.body)).not.toMatch(/password|token/i);
    // The switcher list carries names only: no member emails or invite codes
    expect(mine.body[0].members[0].user).toEqual(expect.objectContaining({ name: expect.any(String) }));
    expect(mine.body[0].members[0].user.email).toBeUndefined();
    expect(mine.body[0].inviteCode).toBeUndefined();

    const none = await get(outsider, '/api/workspaces');
    expect(none.body.filter((w: { slug: string }) => w.slug === team.workspace.slug)).toHaveLength(0);
  });
});

describe('workspaces: read by slug', () => {
  it('lets a member read it', async () => {
    const res = await get(team.viewer, `/api/workspaces/${team.workspace.slug}`);
    expect(res.status).toBe(200);
    expect(res.body.slug).toBe(team.workspace.slug);
    expect(res.body.members).toHaveLength(4);
    expect(JSON.stringify(res.body)).not.toMatch(/password/i);
  });

  it('forbids a non-member and 404s an unknown slug', async () => {
    expect((await get(outsider, `/api/workspaces/${team.workspace.slug}`)).status).toBe(403);
    expect((await get(outsider, '/api/workspaces/does-not-exist')).status).toBe(404);
  });

  it('switches the active workspace only for members', async () => {
    expect((await http().put(`/api/workspaces/${team.workspace.slug}/activate`).set(bearer(team.developer.token))).status).toBe(200);
    expect((await http().put(`/api/workspaces/${team.workspace.slug}/activate`).set(bearer(outsider.token))).status).toBe(404);
  });
});

describe('workspaces: rename', () => {
  it('lets the owner rename without touching the slug', async () => {
    const res = await http()
      .put(`/api/workspaces/${team.workspace.slug}`)
      .set(bearer(team.owner.token))
      .send({ name: '  Renamed Team  ' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Renamed Team');
    expect(res.body.slug).toBe(team.workspace.slug);
  });

  it('validates the name', async () => {
    const put = (name: unknown) =>
      http().put(`/api/workspaces/${team.workspace.slug}`).set(bearer(team.owner.token)).send({ name });
    expect((await put('')).status).toBe(400);
    expect((await put('   ')).status).toBe(400);
    expect((await put('n'.repeat(61))).status).toBe(400);
    expect((await put({ $ne: 1 })).status).toBe(400);
    expect((await put(undefined)).status).toBe(400);
  });

  it('requires settings:manage', async () => {
    for (const user of [team.viewer, team.developer]) {
      const res = await http().put(`/api/workspaces/${team.workspace.slug}`).set(bearer(user.token)).send({ name: 'Hacked' });
      expect(res.status).toBe(403);
    }
    expect((await http().put(`/api/workspaces/${team.workspace.slug}`).set(bearer(outsider.token)).send({ name: 'Hacked' })).status).toBe(403);
  });
});

describe('workspaces: members', () => {
  it('lists members by role seniority then name, with public fields only', async () => {
    const res = await get(team.developer, `/api/workspaces/${team.workspace.slug}/members`);
    expect(res.status).toBe(200);
    const names = res.body.slice(0, 4).map((m: { name: string }) => m.name);
    expect(names).toEqual(['Olivia Owner', 'Pat Product', 'Dan Developer', 'Vera Viewer']);

    const roles = res.body.map((m: { role: { name: string } }) => m.role.name);
    const rank = ['Product Owner', 'Scrum Master', 'Developer', 'Team Member', 'Viewer'];
    const ranks = roles.map((name: string) => rank.indexOf(name));
    expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);

    const keys = Object.keys(res.body[0]).sort();
    expect(keys).toEqual(['_id', 'avatarUrl', 'email', 'jobTitle', 'joinedAt', 'name', 'role']);
    expect(JSON.stringify(res.body)).not.toMatch(/password|verificationToken|resetPassword/i);
  });

  it('requires users:read (Viewer has none) and membership', async () => {
    expect((await get(team.viewer, `/api/workspaces/${team.workspace.slug}/members`)).status).toBe(403);
    expect((await get(outsider, `/api/workspaces/${team.workspace.slug}/members`)).status).toBe(403);
    expect((await http().get(`/api/workspaces/${team.workspace.slug}/members`)).status).toBe(401);
  });
});

describe('workspaces: removing members', () => {
  it('lets users:write remove a member who then loses access', async () => {
    const leaver = await registerUser('Leaver');
    await http().post('/api/workspaces/join').set(bearer(leaver.token)).send({ inviteCode: team.workspace.inviteCode });
    expect((await get(leaver, `/api/workspaces/${team.workspace.slug}`)).status).toBe(200);

    const res = await http().delete(`/api/workspaces/${team.workspace.slug}/members/${leaver.id}`).set(bearer(team.owner.token));
    expect(res.status).toBe(200);
    expect((await get(leaver, `/api/workspaces/${team.workspace.slug}`)).status).toBe(403);
    expect((await get(leaver, `/api/workspaces/${team.workspace.slug}/tasks`)).status).toBe(403);
    const profile = await get(leaver, '/api/profile');
    expect(profile.body.workspaces.map((w: { slug: string }) => w.slug)).not.toContain(team.workspace.slug);

    const again = await http().delete(`/api/workspaces/${team.workspace.slug}/members/${leaver.id}`).set(bearer(team.owner.token));
    expect(again.status).toBe(404);
  });

  it('never removes the owner or yourself, and needs users:write', async () => {
    const del = (as: TestUser, target: string) =>
      http().delete(`/api/workspaces/${team.workspace.slug}/members/${target}`).set(bearer(as.token));
    expect((await del(team.owner, team.owner.id)).status).toBe(400);
    expect((await del(team.productOwner, team.owner.id)).status).toBe(403);
    expect((await del(team.developer, team.viewer.id)).status).toBe(403);
    expect((await del(team.viewer, team.developer.id)).status).toBe(403);
    expect((await del(outsider, team.viewer.id)).status).toBe(403);
  });

  it('answers an unknown email lookup like any other 404 (no crash on odd ids)', async () => {
    const res = await http()
      .delete(`/api/workspaces/${team.workspace.slug}/members/${encodeURIComponent(uniqueEmail('x'))}`)
      .set(bearer(team.owner.token));
    expect(res.status).toBe(404);
  });
});

describe('workspace details by permission', () => {
  it('shows member emails and the invite code only to roles that manage people', async () => {
    const asViewer = await get(team.viewer, `/api/workspaces/${team.workspace.slug}`);
    expect(asViewer.status).toBe(200);
    expect(asViewer.body.inviteCode).toBeUndefined();
    expect(asViewer.body.members.every((m: { user: { email?: string } }) => m.user.email === undefined)).toBe(true);

    const asOwner = await get(team.owner, `/api/workspaces/${team.workspace.slug}`);
    expect(asOwner.body.inviteCode).toMatch(/^[A-F0-9]{12}$/);
    expect(asOwner.body.members.some((m: { user: { email?: string } }) => typeof m.user.email === 'string')).toBe(true);
  });
});


describe('leaving a workspace', () => {
  it('lets a member leave (unassigning their tasks) but not the owner', async () => {
    const leaver = await registerUser('Lena Leaver');
    await joinAs(team.workspace, team.owner, leaver, 'Developer');
    const task = await createTask(team.owner, team.workspace.slug, { title: 'Assigned to Lena', assignees: [leaver.id] });

    const res = await http().delete(`/api/workspaces/${team.workspace.slug}/members/me`).set(bearer(leaver.token));
    expect(res.status).toBe(200);
    expect((await get(leaver, `/api/workspaces/${team.workspace.slug}`)).status).toBe(403);
    const tasks = await get(team.owner, `/api/workspaces/${team.workspace.slug}/tasks`);
    expect(tasks.body.find((t: { _id: string }) => t._id === task._id).assignees).toEqual([]);

    const owner = await http().delete(`/api/workspaces/${team.workspace.slug}/members/me`).set(bearer(team.owner.token));
    expect(owner.status).toBe(409);
    const stranger = await http().delete(`/api/workspaces/${team.workspace.slug}/members/me`).set(bearer(leaver.token));
    expect(stranger.status).toBe(404);
  });
});
