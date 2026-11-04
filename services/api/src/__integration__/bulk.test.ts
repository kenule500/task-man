import {
  bearer, createTask, createTeam, createWorkspace, http, registerUser, startApp, stopApp, tasksUrl, unknownId,
  type TestUser,
} from './harness.js';

beforeAll(startApp);
afterAll(stopApp);

type Team = Awaited<ReturnType<typeof createTeam>>;
let team: Team;
let slug: string;
let outsider: TestUser;
let foreignSlug: string;

beforeAll(async () => {
  team = await createTeam();
  slug = team.workspace.slug;
  outsider = await registerUser('Foreign Owner');
  foreignSlug = (await createWorkspace(outsider, 'Foreign Bulk')).slug;
});

const bulkPatch = (body: object, user: TestUser = team.owner, where = slug) =>
  http().patch(`${tasksUrl(where)}/bulk`).set(bearer(user.token)).send(body);
const bulkDelete = (body: object, user: TestUser = team.owner, where = slug) =>
  http().post(`${tasksUrl(where)}/bulk-delete`).set(bearer(user.token)).send(body);
const listTasks = async (where = slug, user: TestUser = team.owner) =>
  (await http().get(tasksUrl(where)).set(bearer(user.token))).body as { _id: string; [key: string]: any }[];
const taskOf = async (id: string, where = slug, user: TestUser = team.owner) =>
  (await listTasks(where, user)).find(task => task._id === id);
const auditOf = async (id: string) =>
  (await http().get(`${tasksUrl(slug)}/${id}/activity`).set(bearer(team.owner.token))).body.items as
    { action: string; changes: { field: string; from?: string; to?: string }[] }[];

describe('bulk edit', () => {
  it('changes status, priority and type on several tasks and audits each of them', async () => {
    const a = await createTask(team.owner, slug, { title: 'Bulk A' });
    const b = await createTask(team.owner, slug, { title: 'Bulk B', priority: 'low' });

    const res = await bulkPatch({ ids: [a._id, b._id], patch: { status: 'completed', priority: 'high', type: 'bug' } });
    expect(res.status).toBe(200);
    expect(res.body.tasks).toHaveLength(2);
    for (const task of res.body.tasks) {
      expect(task).toMatchObject({ status: 'completed', priority: 'high', type: 'bug' });
    }
    expect((await taskOf(b._id))).toMatchObject({ status: 'completed', priority: 'high', type: 'bug' });

    for (const id of [a._id, b._id]) {
      const [latest] = await auditOf(id);
      expect(latest.action).toBe('task.updated');
      expect(latest.changes).toEqual(expect.arrayContaining([{ field: 'status', from: 'pending', to: 'completed' }]));
    }
  });

  it('adds and removes assignees and labels, exposing assignees without email', async () => {
    const a = await createTask(team.owner, slug, { labels: ['keep', 'drop'], assignees: [team.owner.id] });
    const b = await createTask(team.owner, slug);

    const res = await bulkPatch({
      ids: [a._id, b._id],
      patch: { assignees: { add: [team.developer.id], remove: [team.owner.id] }, labels: { add: ['New'], remove: ['DROP'] } },
    });
    expect(res.status).toBe(200);
    const byId = Object.fromEntries(res.body.tasks.map((task: { _id: string }) => [task._id, task]));
    expect(byId[a._id].labels).toEqual(['keep', 'New']);
    expect(byId[b._id].labels).toEqual(['New']);
    expect(byId[a._id].assignees.map((user: { _id: string }) => user._id)).toEqual([team.developer.id]);
    expect(Object.keys(byId[a._id].assignees[0]).sort()).toEqual(['_id', 'avatarUrl', 'name']);
    expect(JSON.stringify(res.body)).not.toContain(team.developer.email);
  });

  it('rejects assignees that are not members and changes nothing', async () => {
    const task = await createTask(team.owner, slug);
    const res = await bulkPatch({ ids: [task._id], patch: { status: 'completed', assignees: { add: [outsider.id] } } });
    expect(res.status).toBe(400);
    expect((await taskOf(task._id))?.status).toBe('pending');
  });

  it('saves nothing when one task would exceed the label limit', async () => {
    const labels = Array.from({ length: 10 }, (_, index) => `label-${index}`);
    const full = await createTask(team.owner, slug, { labels });
    const room = await createTask(team.owner, slug);

    const res = await bulkPatch({ ids: [room._id, full._id], patch: { labels: { add: ['one-too-many'] } } });
    expect(res.status).toBe(400);
    expect((await taskOf(room._id))?.labels).toEqual([]);
  });

  it.each([
    ['no ids', { ids: [], patch: { status: 'completed' } }],
    ['more than 100 ids', { ids: Array.from({ length: 101 }, () => unknownId()), patch: { status: 'completed' } }],
    ['an invalid id', { ids: ['nope'], patch: { status: 'completed' } }],
    ['an invalid status', { ids: [unknownId()], patch: { status: 'done' } }],
    ['an empty patch', { ids: [unknownId()], patch: {} }],
  ])('rejects %s with 400', async (_name, body) => {
    expect((await bulkPatch(body)).status).toBe(400);
  });

  it('moves tasks into an open sprint (and their project), rejects completed sprints, and clears the sprint with null', async () => {
    const projectRes = await http().post(`/api/workspaces/${slug}/projects`).set(bearer(team.owner.token))
      .send({ name: `Bulk Project ${unknownId().slice(0, 6)}` });
    expect(projectRes.status).toBe(201);
    const project = projectRes.body as { _id: string; name: string };
    const sprintsUrl = `/api/workspaces/${slug}/projects/${project._id}/sprints`;
    const sprint = (await http().post(sprintsUrl).set(bearer(team.owner.token))
      .send({ name: 'Sprint 1', startDate: '2030-01-06', endDate: '2030-01-19' })).body as { _id: string };

    const parent = await createTask(team.owner, slug, { title: 'Parent' });
    const child = await createTask(team.owner, slug, { title: 'Child', parent: parent._id });
    const other = await createTask(team.owner, slug, { title: 'Other' });

    const moved = await bulkPatch({ ids: [parent._id, other._id], patch: { sprint: sprint._id } });
    expect(moved.status).toBe(200);
    expect(moved.body.tasks.every((task: { sprint: string; project: string }) => task.sprint === sprint._id && task.project === project.name)).toBe(true);
    expect(await taskOf(child._id)).toMatchObject({ sprint: sprint._id, project: project.name });

    const cleared = await bulkPatch({ ids: [other._id], patch: { sprint: null } });
    expect(cleared.status).toBe(200);
    expect(cleared.body.tasks[0]).toMatchObject({ sprint: null, project: project.name });

    expect((await bulkPatch({ ids: [other._id], patch: { sprint: unknownId() } })).status).toBe(400);

    await http().post(`${sprintsUrl}/${sprint._id}/start`).set(bearer(team.owner.token));
    await http().post(`${sprintsUrl}/${sprint._id}/complete`).set(bearer(team.owner.token)).send({ moveOpenTo: 'backlog' });
    expect((await bulkPatch({ ids: [other._id], patch: { sprint: sprint._id } })).status).toBe(400);
  });

  it('needs tasks:write: Viewer gets 403, Developer may edit, anonymous gets 401', async () => {
    const task = await createTask(team.owner, slug);
    const body = { ids: [task._id], patch: { status: 'in-progress' } };
    expect((await bulkPatch(body, team.viewer)).status).toBe(403);
    expect((await taskOf(task._id))?.status).toBe('pending');
    expect((await bulkPatch(body, team.developer)).status).toBe(200);
    expect((await http().patch(`${tasksUrl(slug)}/bulk`).send(body)).status).toBe(401);
  });

  it('never touches tasks of another workspace', async () => {
    const mine = await createTask(team.owner, slug, { title: 'Mine' });
    const foreign = await createTask(outsider, foreignSlug, { title: 'Foreign' });

    // Only foreign ids: nothing found in this workspace
    expect((await bulkPatch({ ids: [foreign._id], patch: { status: 'completed' } })).status).toBe(404);
    // Mixed ids: only my task changes
    const mixed = await bulkPatch({ ids: [mine._id, foreign._id], patch: { status: 'completed' } });
    expect(mixed.status).toBe(200);
    expect(mixed.body.tasks.map((task: { _id: string }) => task._id)).toEqual([mine._id]);
    expect((await taskOf(foreign._id, foreignSlug, outsider))?.status).toBe('pending');

    // A member of another workspace cannot use this workspace's URL
    expect((await bulkPatch({ ids: [mine._id], patch: { status: 'pending' } }, outsider)).status).toBe(403);
  });
});

describe('bulk delete', () => {
  it('removes tasks with their subtasks, detaches dependencies and audits each task', async () => {
    const a = await createTask(team.owner, slug, { title: 'Delete A' });
    const sub = await createTask(team.owner, slug, { title: 'Delete A sub', parent: a._id });
    const b = await createTask(team.owner, slug, { title: 'Delete B' });
    const dependent = await createTask(team.owner, slug, { title: 'Depends', dependencies: [a._id, b._id] });
    const survivor = await createTask(team.owner, slug, { title: 'Survivor' });

    const res = await bulkDelete({ ids: [a._id, b._id] });
    expect(res.status).toBe(200);
    expect(res.body.deleted.sort()).toEqual([a._id, b._id].sort());
    expect(res.body.subtasks).toEqual([sub._id]);

    const remaining = (await listTasks()).map(task => task._id);
    for (const gone of [a._id, b._id, sub._id]) expect(remaining).not.toContain(gone);
    expect(remaining).toEqual(expect.arrayContaining([dependent._id, survivor._id]));
    expect((await taskOf(dependent._id))?.dependencies).toEqual([]);

    const audit = await http().get(`/api/workspaces/${slug}/activity?area=task`).set(bearer(team.owner.token));
    const deletions = audit.body.items.filter((item: { action: string; summary: string }) =>
      item.action === 'task.deleted' && ['Delete A', 'Delete B'].includes(item.summary));
    expect(deletions).toHaveLength(2);
  });

  it('skips ids that do not exist and answers 404 when none exist', async () => {
    const task = await createTask(team.owner, slug);
    const res = await bulkDelete({ ids: [task._id, unknownId()] });
    expect(res.status).toBe(200);
    expect(res.body.deleted).toEqual([task._id]);
    expect((await bulkDelete({ ids: [unknownId()] })).status).toBe(404);
  });

  it.each([
    ['no ids', { ids: [] }],
    ['an invalid id', { ids: ['nope'] }],
    ['more than 100 ids', { ids: Array.from({ length: 101 }, () => unknownId()) }],
  ])('rejects %s with 400', async (_name, body) => {
    expect((await bulkDelete(body)).status).toBe(400);
  });

  it('needs tasks:delete: Viewer and Developer get 403, Product Owner may delete', async () => {
    const task = await createTask(team.owner, slug);
    for (const user of [team.viewer, team.developer]) {
      expect((await bulkDelete({ ids: [task._id] }, user)).status).toBe(403);
    }
    expect(await taskOf(task._id)).toBeDefined();
    expect((await bulkDelete({ ids: [task._id] }, team.productOwner)).status).toBe(200);
    expect((await http().post(`${tasksUrl(slug)}/bulk-delete`).send({ ids: [task._id] })).status).toBe(401);
  });

  it('never deletes tasks of another workspace', async () => {
    const foreign = await createTask(outsider, foreignSlug, { title: 'Foreign keep' });
    expect((await bulkDelete({ ids: [foreign._id] })).status).toBe(404);
    expect(await taskOf(foreign._id, foreignSlug, outsider)).toBeDefined();
    expect((await bulkDelete({ ids: [foreign._id] }, outsider)).status).toBe(403);
  });
});

describe('board settings', () => {
  const url = (where = slug) => `/api/workspaces/${where}/board-settings`;
  const get = (user: TestUser = team.owner, where = slug) => http().get(url(where)).set(bearer(user.token));
  const put = (body: object, user: TestUser = team.owner, where = slug) =>
    http().put(url(where)).set(bearer(user.token)).send(body);

  it('starts without limits and lets every member read them', async () => {
    for (const user of [team.owner, team.viewer, team.developer]) {
      const res = await get(user);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ wipLimits: { pending: null, 'in-progress': null, completed: null } });
    }
    expect((await http().get(url())).status).toBe(401);
  });

  it('saves limits, keeps columns left out, clears with null and audits the change', async () => {
    const saved = await put({ wipLimits: { 'in-progress': 3, pending: 10 } });
    expect(saved.status).toBe(200);
    expect(saved.body).toEqual({ wipLimits: { pending: 10, 'in-progress': 3, completed: null } });

    const cleared = await put({ wipLimits: { pending: null } });
    expect(cleared.body).toEqual({ wipLimits: { pending: null, 'in-progress': 3, completed: null } });
    expect((await get(team.viewer)).body).toEqual(cleared.body);

    const audit = await http().get(`/api/workspaces/${slug}/activity?area=workspace`).set(bearer(team.owner.token));
    const entry = audit.body.items.find((item: { changes: { field: string }[] }) =>
      item.changes.some(change => change.field === 'wip:in-progress'));
    expect(entry).toMatchObject({ action: 'workspace.updated' });
    expect(entry.changes).toEqual(expect.arrayContaining([{ field: 'wip:in-progress', to: '3' }]));
  });

  it.each([
    ['zero', { wipLimits: { pending: 0 } }],
    ['a negative number', { wipLimits: { pending: -2 } }],
    ['a number above 999', { wipLimits: { completed: 1000 } }],
    ['a fraction', { wipLimits: { pending: 1.5 } }],
    ['a string', { wipLimits: { pending: '3' } }],
    ['an unknown column', { wipLimits: { blocked: 2 } }],
    ['a missing wipLimits', {}],
  ])('rejects %s with 400', async (_name, body) => {
    expect((await put(body)).status).toBe(400);
  });

  it('needs settings:manage to change: Viewer, Developer and anonymous are refused', async () => {
    const before = (await get()).body;
    expect((await put({ wipLimits: { pending: 1 } }, team.viewer)).status).toBe(403);
    expect((await put({ wipLimits: { pending: 1 } }, team.developer)).status).toBe(403);
    expect((await http().put(url()).send({ wipLimits: { pending: 1 } })).status).toBe(401);
    expect((await get()).body).toEqual(before);
  });

  it('is isolated per workspace', async () => {
    await put({ wipLimits: { completed: 7 } });
    expect((await get(outsider, foreignSlug)).body).toEqual({ wipLimits: { pending: null, 'in-progress': null, completed: null } });
    expect((await get(outsider, slug)).status).toBe(403);
    expect((await put({ wipLimits: { completed: 1 } }, outsider, slug)).status).toBe(403);
    expect((await get()).body.wipLimits.completed).toBe(7);
  });
});
