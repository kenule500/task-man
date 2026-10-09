import {
  bearer, createTask, createTeam, createWorkspace, http, joinAs, registerUser, startApp, stopApp,
  systemRoleIds, tasksUrl, unknownId, type SystemRoleName, type TestUser,
} from './harness.js';

beforeAll(startApp);
afterAll(stopApp);

type Team = Awaited<ReturnType<typeof createTeam>>;
let team: Team;
let slug: string;
let roleIds: Record<SystemRoleName, string>;
let outsider: TestUser;

beforeAll(async () => {
  team = await createTeam();
  slug = team.workspace.slug;
  roleIds = await systemRoleIds(team.owner, slug);
  outsider = await registerUser('Other Owner');
});

const rolesUrl = () => `/api/workspaces/${slug}/roles`;
const as = (user: TestUser) => ({
  get: (path: string) => http().get(path).set(bearer(user.token)),
  post: (path: string, body?: object) => http().post(path).set(bearer(user.token)).send(body),
  put: (path: string, body?: object) => http().put(path).set(bearer(user.token)).send(body),
  patch: (path: string, body?: object) => http().patch(path).set(bearer(user.token)).send(body),
  del: (path: string) => http().delete(path).set(bearer(user.token)),
});

describe('rbac: task permissions per role', () => {
  let taskId: string;
  beforeAll(async () => {
    taskId = (await createTask(team.owner, slug, { title: 'Owned by the owner' }))._id;
  });

  it('lets a Viewer read but not write or delete', async () => {
    const viewer = as(team.viewer);
    const list = await viewer.get(tasksUrl(slug));
    expect(list.status).toBe(200);
    expect(list.body.map((t: { _id: string }) => t._id)).toContain(taskId);

    expect((await viewer.post(tasksUrl(slug), { title: 'Nope', deadline: '2030-01-01' })).status).toBe(403);
    expect((await viewer.put(`${tasksUrl(slug)}/${taskId}`, { title: 'Nope' })).status).toBe(403);
    expect((await viewer.patch(`${tasksUrl(slug)}/${taskId}`, { title: 'Nope' })).status).toBe(403);
    expect((await viewer.del(`${tasksUrl(slug)}/${taskId}`)).status).toBe(403);
    expect((await viewer.post(`${tasksUrl(slug)}/${taskId}/comments`, { text: 'hi' })).status).toBe(403);
  });

  it('lets a Developer create and update but not delete', async () => {
    const dev = as(team.developer);
    const created = await dev.post(tasksUrl(slug), { title: 'Dev task', deadline: '2030-01-01' });
    expect(created.status).toBe(201);
    expect((await dev.put(`${tasksUrl(slug)}/${created.body._id}`, { title: 'Dev task v2' })).status).toBe(200);
    expect((await dev.patch(`${tasksUrl(slug)}/${created.body._id}`, { status: 'in-progress' })).status).toBe(200);
    expect((await dev.del(`${tasksUrl(slug)}/${created.body._id}`)).status).toBe(403);
  });

  it('lets a Product Owner delete', async () => {
    const po = as(team.productOwner);
    const task = await createTask(team.productOwner, slug, { title: 'To delete' });
    const res = await po.del(`${tasksUrl(slug)}/${task._id}`);
    expect(res.status).toBe(200);
    expect((await po.del(`${tasksUrl(slug)}/${task._id}`)).status).toBe(404);
  });

  it('refuses everything to a non-member and to anonymous callers', async () => {
    const stranger = as(outsider);
    expect((await stranger.get(tasksUrl(slug))).status).toBe(403);
    expect((await stranger.post(tasksUrl(slug), { title: 'x', deadline: '2030-01-01' })).status).toBe(403);
    expect((await http().get(tasksUrl(slug))).status).toBe(401);
    // the slug of a workspace that does not exist is a 403 as well (no existence oracle)
    expect((await stranger.get(tasksUrl('no-such-workspace'))).status).toBe(403);
  });

  it('reflects each role in /currentuser', async () => {
    const dev = await as(team.developer).get(`/api/auth/currentuser?workspaceSlug=${slug}`);
    expect(dev.body.role.name).toBe('Developer');
    expect(dev.body.permissions).toEqual(expect.arrayContaining(['tasks:read', 'tasks:write']));
    expect(dev.body.permissions).not.toContain('tasks:delete');
    expect(dev.body.actions).toEqual(expect.arrayContaining(['read', 'create', 'update']));

    const stranger = await as(outsider).get(`/api/auth/currentuser?workspaceSlug=${slug}`);
    expect(stranger.body.workspace).toBeNull();
    expect(stranger.body.permissions).toEqual([]);
  });
});

describe('rbac: permission catalog and role listing', () => {
  it('serves the grouped catalog to any logged-in user only', async () => {
    const res = await as(outsider).get('/api/roles/permissions');
    expect(res.status).toBe(200);
    expect(res.body.Tasks.map((p: { key: string }) => p.key)).toEqual(['tasks:read', 'tasks:write', 'tasks:delete']);
    expect((await http().get('/api/roles/permissions')).status).toBe(401);
  });

  it('lists the five system roles to users:read and refuses a Viewer', async () => {
    const res = await as(team.developer).get(rolesUrl());
    expect(res.status).toBe(200);
    const system = res.body.filter((r: { isSystem: boolean }) => r.isSystem).map((r: { name: string }) => r.name).sort();
    expect(system).toEqual(['Developer', 'Product Owner', 'Scrum Master', 'Team Member', 'Viewer']);
    expect((await as(team.viewer).get(rolesUrl())).status).toBe(403);
    expect((await as(outsider).get(rolesUrl())).status).toBe(403);
  });
});

describe('rbac: custom roles', () => {
  const owner = () => as(team.owner);
  let reviewerId: string;

  it('creates a custom role (settings:manage only)', async () => {
    const res = await owner().post(rolesUrl(), {
      name: '  Reviewer  ',
      description: ' Reads and comments ',
      permissions: ['tasks:read', 'tasks:write'],
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      name: 'Reviewer', description: 'Reads and comments', isSystem: false, workspaceId: team.workspace.id,
    });
    reviewerId = res.body._id;

    expect((await as(team.developer).post(rolesUrl(), { name: 'Sneaky', permissions: [] })).status).toBe(403);
    expect((await as(team.viewer).post(rolesUrl(), { name: 'Sneaky', permissions: [] })).status).toBe(403);
    expect((await as(team.productOwner).post(rolesUrl(), { name: 'Ok PO', permissions: [] })).status).toBe(201);
  });

  it('validates name, description and permissions', async () => {
    const post = (body: object) => owner().post(rolesUrl(), body);
    expect((await post({ permissions: [] })).status).toBe(400);
    expect((await post({ name: '   ', permissions: [] })).status).toBe(400);
    expect((await post({ name: 'x'.repeat(61), permissions: [] })).status).toBe(400);
    expect((await post({ name: { $ne: '' }, permissions: [] })).status).toBe(400);
    expect((await post({ name: 'Long desc', description: 'd'.repeat(281), permissions: [] })).status).toBe(400);
    expect((await post({ name: 'No perms' })).status).toBe(400);
    expect((await post({ name: 'Bad perms', permissions: 'tasks:read' })).status).toBe(400);
    const unknown = await post({ name: 'Unknown perm', permissions: ['tasks:read', 'tasks:fly'] });
    expect(unknown.status).toBe(400);
    expect(unknown.body.message).toMatch(/tasks:fly/);
    expect((await post({ name: 'Object perm', permissions: [{ $ne: 1 }] })).status).toBe(400);
    expect((await post({ name: 'Proto perm', permissions: ['__proto__', 'constructor'] })).status).toBe(400);
    expect((await post({ name: 'x'.repeat(60), permissions: [] })).status).toBe(201);
  });

  it('rejects a duplicate name inside the workspace but allows it in another one', async () => {
    expect((await owner().post(rolesUrl(), { name: 'Reviewer', permissions: [] })).status).toBe(409);
    const other = await createWorkspace(outsider, 'Role Twin Space');
    const res = await as(outsider).post(`/api/workspaces/${other.slug}/roles`, { name: 'Reviewer', permissions: [] });
    expect(res.status).toBe(201);
  });

  it('lists custom roles only inside their own workspace', async () => {
    const mine = await owner().get(rolesUrl());
    expect(mine.body.map((r: { name: string }) => r.name)).toContain('Reviewer');
    const otherWs = await createWorkspace(outsider, 'Role Isolation');
    const theirs = await as(outsider).get(`/api/workspaces/${otherWs.slug}/roles`);
    expect(theirs.body.map((r: { name: string }) => r.name)).not.toContain('Reviewer');
  });

  it('updates name, description and permissions', async () => {
    const res = await owner().put(`${rolesUrl()}/${reviewerId}`, {
      name: 'Reviewer 2', description: 'Updated', permissions: ['tasks:read'],
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: 'Reviewer 2', description: 'Updated', permissions: ['tasks:read'] });

    const partial = await owner().put(`${rolesUrl()}/${reviewerId}`, { description: 'Only this' });
    expect(partial.body).toMatchObject({ name: 'Reviewer 2', description: 'Only this', permissions: ['tasks:read'] });
  });

  it('validates updates and blocks name collisions', async () => {
    const put = (body: object) => owner().put(`${rolesUrl()}/${reviewerId}`, body);
    expect((await put({ name: '' })).status).toBe(400);
    expect((await put({ name: 'x'.repeat(61) })).status).toBe(400);
    expect((await put({ name: { $ne: 1 } })).status).toBe(400);
    expect((await put({ permissions: 'all' })).status).toBe(400);
    expect((await put({ permissions: ['nope:nope'] })).status).toBe(400);
    expect((await put({ description: 'd'.repeat(281) })).status).toBe(400);
    expect((await put({ name: 'Ok PO' })).status).toBe(409);
    expect((await put({ name: 'Reviewer 2' })).status).toBe(200);
  });

  it('cannot touch system roles or roles of another workspace', async () => {
    expect((await owner().put(`${rolesUrl()}/${roleIds.Viewer}`, { permissions: ['settings:manage'] })).status).toBe(404);
    expect((await owner().del(`${rolesUrl()}/${roleIds.Viewer}`)).status).toBe(404);

    const otherWs = await createWorkspace(outsider, 'Role Owner Space');
    const foreign = await as(outsider).post(`/api/workspaces/${otherWs.slug}/roles`, { name: 'Foreign', permissions: [] });
    expect((await owner().put(`${rolesUrl()}/${foreign.body._id}`, { name: 'Taken over' })).status).toBe(404);
    expect((await owner().del(`${rolesUrl()}/${foreign.body._id}`)).status).toBe(404);
  });

  it('requires settings:manage for update and delete', async () => {
    expect((await as(team.developer).put(`${rolesUrl()}/${reviewerId}`, { name: 'x' })).status).toBe(403);
    expect((await as(team.developer).del(`${rolesUrl()}/${reviewerId}`)).status).toBe(403);
  });

  it('refuses to delete a role that is still assigned (409) and deletes it afterwards', async () => {
    const holder = await registerUser('Role Holder');
    await joinAs(team.workspace, team.owner, holder, reviewerId);

    const blocked = await owner().del(`${rolesUrl()}/${reviewerId}`);
    expect(blocked.status).toBe(409);

    await owner().put(`/api/workspaces/${slug}/members/${holder.id}/role`, { roleId: roleIds.Viewer });
    const ok = await owner().del(`${rolesUrl()}/${reviewerId}`);
    expect(ok.status).toBe(200);
    expect((await owner().del(`${rolesUrl()}/${reviewerId}`)).status).toBe(404);
  });

  // findCustomRoleOr404 passes the raw :id to Role.findOne -> CastError -> 500
  it('answers 404 (not 500) for a malformed role id on update and delete', async () => {
    expect((await owner().put(`${rolesUrl()}/not-an-id`, { name: 'x' })).status).toBe(404);
    expect((await owner().del(`${rolesUrl()}/not-an-id`)).status).toBe(404);
  });

  it('answers 404 for a well-formed unknown role id', async () => {
    expect((await owner().put(`${rolesUrl()}/${unknownId()}`, { name: 'x' })).status).toBe(404);
    expect((await owner().del(`${rolesUrl()}/${unknownId()}`)).status).toBe(404);
  });

  // The role editor has no privilege ceiling: whoever holds settings:manage through a custom role
  // can add any permission (users:write, tasks:delete...) to the role they hold themselves.
  it('does not let a non-owner raise their own custom role above their current access', async () => {
    const created = await owner().post(rolesUrl(), {
      name: 'Settings Admin', permissions: ['settings:manage', 'tasks:read', 'projects:read'],
    });
    const admin = await registerUser('Settings Admin');
    await joinAs(team.workspace, team.owner, admin, created.body._id);

    const escalate = await as(admin).put(`${rolesUrl()}/${created.body._id}`, {
      permissions: ['settings:manage', 'tasks:read', 'projects:read', 'users:write', 'tasks:delete'],
    });
    expect(escalate.status).toBe(403);
  });
});

describe('rbac: changing a member role', () => {
  let sam: TestUser;
  let rita: TestUser;
  let secondOwnerLike: TestUser;
  const roleUrl = (userId: string) => `/api/workspaces/${slug}/members/${userId}/role`;

  beforeAll(async () => {
    sam = await registerUser('Sam Subject');
    rita = await registerUser('Rita Recruiter');
    secondOwnerLike = await registerUser('Peter Productowner');
    await joinAs(team.workspace, team.owner, sam, 'Viewer');
    const recruiter = await as(team.owner).post(rolesUrl(), {
      name: 'Recruiter',
      permissions: ['users:read', 'users:write', 'projects:read', 'tasks:read', 'reports:read'],
    });
    await joinAs(team.workspace, team.owner, rita, recruiter.body._id);
    await joinAs(team.workspace, team.owner, secondOwnerLike, 'Product Owner');
  });

  it('lets the owner change a role and the new permissions apply immediately', async () => {
    const res = await as(team.owner).put(roleUrl(sam.id), { roleId: roleIds['Scrum Master'] });
    expect(res.status).toBe(200);
    expect(res.body.role.name).toBe('Scrum Master');

    const created = await as(sam).post(tasksUrl(slug), { title: 'SM task', deadline: '2030-01-01' });
    expect(created.status).toBe(201);

    const back = await as(team.owner).put(roleUrl(sam.id), { roleId: roleIds.Viewer });
    expect(back.status).toBe(200);
    expect((await as(sam).post(tasksUrl(slug), { title: 'x', deadline: '2030-01-01' })).status).toBe(403);
  });

  it('blocks changing your own role', async () => {
    const res = await as(team.owner).put(roleUrl(team.owner.id), { roleId: roleIds.Viewer });
    expect(res.status).toBe(400);
    expect((await as(team.productOwner).put(roleUrl(team.productOwner.id), { roleId: roleIds.Viewer })).status).toBe(400);
  });

  it('never changes the owner role, even for another Product Owner', async () => {
    const res = await as(team.productOwner).put(roleUrl(team.owner.id), { roleId: roleIds.Viewer });
    expect(res.status).toBe(403);
  });

  it('needs users:write', async () => {
    expect((await as(team.developer).put(roleUrl(sam.id), { roleId: roleIds.Viewer })).status).toBe(403);
    expect((await as(team.viewer).put(roleUrl(sam.id), { roleId: roleIds.Viewer })).status).toBe(403);
    expect((await as(outsider).put(roleUrl(sam.id), { roleId: roleIds.Viewer })).status).toBe(403);
  });

  it('stops a non-owner from granting a role above their own permissions', async () => {
    // Rita has users:write but no tasks:write, so she cannot hand out Developer
    const grant = await as(rita).put(roleUrl(sam.id), { roleId: roleIds.Developer });
    expect(grant.status).toBe(403);
    expect(grant.body.message).toMatch(/more access/i);

    // ...nor touch someone who already outranks her
    const demote = await as(rita).put(roleUrl(team.developer.id), { roleId: roleIds.Viewer });
    expect(demote.status).toBe(403);

    // a role within her own permissions is fine
    const ok = await as(rita).put(roleUrl(sam.id), { roleId: roleIds.Viewer });
    expect(ok.status).toBe(200);
  });

  it('stops a non-owner from granting or touching Product Owner, whatever their permissions', async () => {
    const grant = await as(team.productOwner).put(roleUrl(sam.id), { roleId: roleIds['Product Owner'] });
    expect(grant.status).toBe(403);
    const touch = await as(team.productOwner).put(roleUrl(secondOwnerLike.id), { roleId: roleIds.Viewer });
    expect(touch.status).toBe(403);

    // the owner can promote to Product Owner and demote again
    expect((await as(team.owner).put(roleUrl(sam.id), { roleId: roleIds['Product Owner'] })).status).toBe(200);
    expect((await as(team.owner).put(roleUrl(sam.id), { roleId: roleIds.Viewer })).status).toBe(200);
  });

  it('rejects a role id from another workspace or an invalid one with 404', async () => {
    const otherWs = await createWorkspace(outsider, 'Foreign Roles');
    const foreign = await as(outsider).post(`/api/workspaces/${otherWs.slug}/roles`, {
      name: 'Foreign Admin', permissions: ['tasks:read'],
    });
    expect(foreign.status).toBe(201);

    const put = (roleId: unknown) => as(team.owner).put(roleUrl(sam.id), { roleId });
    expect((await put(foreign.body._id)).status).toBe(404);
    expect((await put('not-an-id')).status).toBe(404);
    expect((await put({ $ne: null })).status).toBe(404);
    expect((await put(unknownId())).status).toBe(404);
    expect((await put(undefined)).status).toBe(400);
  });

  it('404s a user who is not a member of the workspace', async () => {
    const res = await as(team.owner).put(roleUrl(outsider.id), { roleId: roleIds.Viewer });
    expect(res.status).toBe(404);
    expect((await as(team.owner).put(roleUrl('not-an-id'), { roleId: roleIds.Viewer })).status).toBe(404);
  });
});
