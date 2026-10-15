import {
  bearer, createTask, createTeam, createWorkspace, http, joinAs, registerUser, startApp, stopApp, tasksUrl, unknownId,
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
  foreignSlug = (await createWorkspace(outsider, 'Foreign Tasks')).slug;
});

const owner = () => team.owner;
const post = (body: object, user: TestUser = owner(), where = slug) =>
  http().post(tasksUrl(where)).set(bearer(user.token)).send(body);
const patch = (id: string, body: object, user: TestUser = owner(), where = slug) =>
  http().patch(`${tasksUrl(where)}/${id}`).set(bearer(user.token)).send(body);
const put = (id: string, body: object, user: TestUser = owner()) =>
  http().put(`${tasksUrl(slug)}/${id}`).set(bearer(user.token)).send(body);
const del = (id: string, user: TestUser = owner(), where = slug) =>
  http().delete(`${tasksUrl(where)}/${id}`).set(bearer(user.token));
const list = (query = '', user: TestUser = owner(), where = slug) =>
  http().get(`${tasksUrl(where)}${query}`).set(bearer(user.token));
const valid = { title: 'A task', deadline: '2030-06-15' };

describe('tasks: create and read', () => {
  it('applies defaults to a minimal task and records the creator and workspace', async () => {
    const res = await post(valid);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      title: 'A task', description: '', status: 'pending', priority: 'medium', project: '',
      labels: [], assignees: [], dependencies: [], comments: [], attachments: [],
      owner: owner().id, workspace: team.workspace.id,
    });
    expect(res.body.deadline).toBe('2030-06-15T00:00:00.000Z');
    expect(res.body.startDate).toBeUndefined();
    expect(typeof res.body.position).toBe('number');
  });

  it('creates a fully specified task and exposes assignees without email', async () => {
    const res = await post({
      title: '  Full task  ', description: 'All the fields', project: 'Website', status: 'in-progress', priority: 'high',
      startDate: '2030-06-01', deadline: '2030-06-30', position: 5, labels: ['ui', ' Bug  fix ', 'UI'],
      assignees: [team.developer.id, team.developer.id],
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      title: 'Full task', project: 'Website', status: 'in-progress', priority: 'high', position: 5,
      labels: ['ui', 'Bug fix'],
    });
    expect(res.body.assignees).toHaveLength(1);
    expect(res.body.assignees[0]).toMatchObject({ _id: team.developer.id, name: 'Dan Developer' });
    expect(Object.keys(res.body.assignees[0]).sort()).toEqual(['_id', 'avatarUrl', 'name']);
    expect(JSON.stringify(res.body)).not.toContain(team.developer.email);
  });

  it('reads the list (newest first) and requires authentication', async () => {
    const res = await list();
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(2);
    expect(res.body[0].priorityRank).toBeUndefined();
    expect(res.body[0].__v).toBeUndefined();
    expect((await http().get(tasksUrl(slug))).status).toBe(401);
  });

  it('rejects invalid payloads with 400', async () => {
    const bad: [string, object][] = [
      ['missing title', { deadline: '2030-01-01' }],
      ['blank title', { title: '   ', deadline: '2030-01-01' }],
      ['title not a string', { title: 42, deadline: '2030-01-01' }],
      ['title object', { title: { $ne: '' }, deadline: '2030-01-01' }],
      ['title too long', { title: 't'.repeat(141), deadline: '2030-01-01' }],
      ['missing deadline', { title: 'x' }],
      ['bad deadline', { title: 'x', deadline: 'tomorrow' }],
      ['bad status', { ...valid, status: 'done' }],
      ['bad priority', { ...valid, priority: 'urgent' }],
      ['description too long', { ...valid, description: 'd'.repeat(2001) }],
      ['project too long', { ...valid, project: 'p'.repeat(61) }],
      ['bad startDate', { ...valid, startDate: 'soon' }],
      ['non numeric position', { ...valid, position: 'first' }],
      ['labels not a list', { ...valid, labels: 'ui' }],
      ['labels with numbers', { ...valid, labels: [1, 2] }],
      ['label too long', { ...valid, labels: ['l'.repeat(41)] }],
      ['too many labels', { ...valid, labels: Array.from({ length: 11 }, (_, i) => `label-${i}`) }],
      ['assignees not a list', { ...valid, assignees: team.developer.id }],
      ['dependencies not a list', { ...valid, dependencies: 'abc' }],
    ];
    for (const [label, body] of bad) {
      const res = await post(body);
      expect([label, res.status]).toEqual([label, 400]);
    }
  });

  it('accepts a title of exactly 140 characters and 10 labels', async () => {
    const res = await post({
      title: 't'.repeat(140), deadline: '2030-01-01', labels: Array.from({ length: 10 }, (_, i) => `l${i}`),
    });
    expect(res.status).toBe(201);
  });

  it('enforces start date <= deadline (equal is fine)', async () => {
    expect((await post({ ...valid, startDate: '2030-07-01', deadline: '2030-06-15' })).status).toBe(400);
    expect((await post({ ...valid, startDate: '2030-06-15', deadline: '2030-06-15' })).status).toBe(201);
  });

  it('rejects assignees who are not members, malformed ids and unknown dependencies', async () => {
    const stranger = await post({ ...valid, assignees: [outsider.id] });
    expect(stranger.status).toBe(400);
    expect(stranger.body.message).toMatch(/members/i);
    expect((await post({ ...valid, assignees: ['not-an-id'] })).status).toBe(400);
    expect((await post({ ...valid, assignees: [unknownId()] })).status).toBe(400);
    expect((await post({ ...valid, dependencies: ['not-an-id'] })).status).toBe(400);
    expect((await post({ ...valid, dependencies: [unknownId()] })).status).toBe(400);
  });

  it('rejects oversized and malformed bodies', async () => {
    const huge = await http().post(tasksUrl(slug)).set(bearer(owner().token)).send({ ...valid, description: 'x'.repeat(200_000) });
    expect(huge.status).toBe(413);
    const broken = await http()
      .post(tasksUrl(slug))
      .set(bearer(owner().token))
      .set('Content-Type', 'application/json')
      .send('{"title": ');
    expect(broken.status).toBe(400);
  });
});

describe('tasks: update', () => {
  it('updates only the fields that are sent (PATCH and PUT)', async () => {
    const task = await createTask(owner(), slug, {
      title: 'Original', description: 'keep me', project: 'P', priority: 'low', labels: ['a'], assignees: [team.developer.id],
    });
    const renamed = await patch(task._id, { title: 'Renamed' });
    expect(renamed.status).toBe(200);
    expect(renamed.body).toMatchObject({ title: 'Renamed', description: 'keep me', project: 'P', priority: 'low', labels: ['a'] });
    expect(renamed.body.assignees).toHaveLength(1);

    const second = await put(task._id, { priority: 'high', deadline: '2031-01-01' });
    expect(second.status).toBe(200);
    expect(second.body).toMatchObject({ title: 'Renamed', priority: 'high', deadline: '2031-01-01T00:00:00.000Z' });
  });

  it('keeps completedAt in sync with the status', async () => {
    const task = await createTask(owner(), slug);
    expect(task.completedAt).toBeUndefined();
    const done = await patch(task._id, { status: 'completed' });
    expect(done.body.completedAt).toBeTruthy();
    const reopened = await patch(task._id, { status: 'pending' });
    expect(reopened.body.completedAt).toBeUndefined();
  });

  it('clears and replaces list fields', async () => {
    const task = await createTask(owner(), slug, { labels: ['x', 'y'], assignees: [team.developer.id], startDate: '2030-06-01' });
    const cleared = await patch(task._id, { labels: [], assignees: [], startDate: null });
    expect(cleared.status).toBe(200);
    expect(cleared.body.labels).toEqual([]);
    expect(cleared.body.assignees).toEqual([]);
    expect(cleared.body.startDate).toBeUndefined();
  });

  it('validates updates', async () => {
    const task = await createTask(owner(), slug, { startDate: '2030-06-10', deadline: '2030-06-20' });
    for (const body of [
      { title: '' }, { title: '   ' }, { title: 't'.repeat(141) }, { deadline: 'nope' }, { status: 'x' },
      { priority: 'x' }, { labels: 'x' }, { assignees: [outsider.id] }, { assignees: 'x' },
    ]) {
      expect([JSON.stringify(body), (await patch(task._id, body)).status]).toEqual([JSON.stringify(body), 400]);
    }
    // moving only the deadline before the stored start date, or only the start after the deadline
    expect((await patch(task._id, { deadline: '2030-06-01' })).status).toBe(400);
    expect((await patch(task._id, { startDate: '2030-07-01' })).status).toBe(400);
    const after = await list();
    const stored = after.body.find((t: { _id: string }) => t._id === task._id);
    expect(stored.deadline).toBe('2030-06-20T00:00:00.000Z');
  });

  it('ignores fields a client must not change', async () => {
    const task = await createTask(owner(), slug);
    const res = await patch(task._id, {
      title: 'Still fine', owner: outsider.id, workspace: unknownId(), completedAt: '2000-01-01',
      comments: [{ text: 'forged' }], attachments: [{ originalName: 'forged' }], _id: unknownId(),
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ _id: task._id, owner: owner().id, workspace: team.workspace.id });
    expect(res.body.comments).toEqual([]);
    expect(res.body.attachments).toEqual([]);
    expect(res.body.completedAt).toBeUndefined();
  });

  it('404s unknown, malformed and foreign task ids', async () => {
    expect((await patch(unknownId(), { title: 'x' })).status).toBe(404);
    expect((await patch('not-an-id', { title: 'x' })).status).toBe(404);
    const foreign = await createTask(outsider, foreignSlug);
    expect((await patch(foreign._id, { title: 'stolen' })).status).toBe(404);
    expect((await del(foreign._id)).status).toBe(404);
    const untouched = await list('', outsider, foreignSlug);
    expect(untouched.body.find((t: { _id: string }) => t._id === foreign._id).title).toBe('Write the report');
  });
});

describe('tasks: dependencies', () => {
  it('rejects self dependencies and cycles (direct and transitive)', async () => {
    const a = await createTask(owner(), slug, { title: 'A' });
    const b = await createTask(owner(), slug, { title: 'B', dependencies: [a._id] });
    const c = await createTask(owner(), slug, { title: 'C', dependencies: [b._id] });

    expect((await patch(a._id, { dependencies: [a._id] })).status).toBe(400);
    const direct = await patch(a._id, { dependencies: [b._id] });
    expect(direct.status).toBe(400);
    expect(direct.body.message).toMatch(/cycle/i);
    expect((await patch(a._id, { dependencies: [c._id] })).status).toBe(400);
    // a valid re-wiring still works
    expect((await patch(c._id, { dependencies: [a._id, b._id] })).status).toBe(200);
  });

  it('refuses dependencies on tasks of another workspace', async () => {
    const foreign = await createTask(outsider, foreignSlug);
    expect((await post({ ...valid, dependencies: [foreign._id] })).status).toBe(400);
    const own = await createTask(owner(), slug);
    expect((await patch(own._id, { dependencies: [foreign._id] })).status).toBe(400);
  });

  it('detaches a deleted task from the tasks that depended on it', async () => {
    const a = await createTask(owner(), slug, { title: 'Prerequisite' });
    const b = await createTask(owner(), slug, { title: 'Dependant', dependencies: [a._id] });
    const c = await createTask(owner(), slug, { title: 'Unrelated' });
    expect((await del(a._id, team.productOwner)).status).toBe(200);

    const tasks = (await list()).body as { _id: string; dependencies: string[] }[];
    expect(tasks.find(t => t._id === a._id)).toBeUndefined();
    expect(tasks.find(t => t._id === b._id)!.dependencies).toEqual([]);
    expect(tasks.find(t => t._id === c._id)).toBeDefined();
  });

  it('404s deleting an unknown or malformed id', async () => {
    expect((await del(unknownId())).status).toBe(404);
    expect((await del('not-an-id')).status).toBe(404);
  });
});

describe('tasks: list filters', () => {
  let filterSlug: string;
  let ids: { alpha: string; beta: string; gamma: string };
  const idsOf = (res: { body: { _id: string }[] }) => res.body.map(t => t._id);

  beforeAll(async () => {
    const workspace = await createWorkspace(owner(), 'Filter Fixtures');
    filterSlug = workspace.slug;
    await joinAs(workspace, owner(), team.developer, 'Developer');

    const alpha = await createTask(owner(), filterSlug, {
      title: 'Alpha design', project: 'Web', labels: ['ui', 'Urgent'], priority: 'high', deadline: '2030-03-01',
      status: 'pending', assignees: [owner().id], position: 30,
    });
    const beta = await createTask(owner(), filterSlug, {
      title: 'Beta backend', description: 'Handles ALPHA api calls', project: 'API', labels: ['api'], priority: 'low',
      deadline: '2030-01-01', status: 'in-progress', assignees: [team.developer.id], position: 10,
    });
    const gamma = await createTask(owner(), filterSlug, {
      title: 'Gamma review', priority: 'medium', deadline: '2030-02-01', status: 'completed', position: 20,
    });
    ids = { alpha: alpha._id, beta: beta._id, gamma: gamma._id };
  });

  const q = (query: string, user: TestUser = owner()) => list(query, user, filterSlug);

  it('filters by status and ignores unknown values or operator payloads', async () => {
    expect(idsOf(await q('?status=completed'))).toEqual([ids.gamma]);
    expect(idsOf(await q('?status=in-progress'))).toEqual([ids.beta]);
    expect((await q('?status=bogus')).body).toHaveLength(3);
    const operator = await q('?status[$ne]=pending');
    expect(operator.status).toBe(200);
    expect(operator.body).toHaveLength(3);
  });

  it('searches title and description case-insensitively and escapes regex characters', async () => {
    expect(idsOf(await q('?search=alpha')).sort()).toEqual([ids.alpha, ids.beta].sort());
    expect(idsOf(await q('?search=GAMMA'))).toEqual([ids.gamma]);
    expect((await q('?search=.*')).body).toHaveLength(0);
    expect((await q('?search=(unclosed')).status).toBe(200);
    expect((await q(`?search=${'z'.repeat(500)}`)).status).toBe(200);
  });

  it('sorts by createdAt (default), deadline, priority and position', async () => {
    expect(idsOf(await q(''))).toEqual([ids.gamma, ids.beta, ids.alpha]);
    expect(idsOf(await q('?sort=deadline'))).toEqual([ids.beta, ids.gamma, ids.alpha]);
    expect(idsOf(await q('?sort=priority'))).toEqual([ids.alpha, ids.gamma, ids.beta]);
    expect(idsOf(await q('?sort=position'))).toEqual([ids.beta, ids.gamma, ids.alpha]);
    expect(idsOf(await q('?sort=password'))).toEqual([ids.gamma, ids.beta, ids.alpha]);
  });

  it('filters by project, label and deadline range', async () => {
    expect(idsOf(await q('?project=Web'))).toEqual([ids.alpha]);
    expect(idsOf(await q('?project=web'))).toEqual([]);
    expect(idsOf(await q('?label=ui'))).toEqual([ids.alpha]);
    expect(idsOf(await q('?label=api'))).toEqual([ids.beta]);
    expect(idsOf(await q('?from=2030-01-15&to=2030-02-15'))).toEqual([ids.gamma]);
    expect(idsOf(await q('?from=2030-02-15')).sort()).toEqual([ids.alpha]);
    expect((await q('?from=not-a-date')).body).toHaveLength(3);
  });

  it('filters by assignee: me, an explicit user id, and ignores junk', async () => {
    expect(idsOf(await q('?assignee=me'))).toEqual([ids.alpha]);
    expect(idsOf(await q('?assignee=me', team.developer))).toEqual([ids.beta]);
    expect(idsOf(await q(`?assignee=${team.developer.id}`))).toEqual([ids.beta]);
    expect(idsOf(await q(`?assignee=${unknownId()}`))).toEqual([]);
    expect((await q('?assignee=nobody')).body).toHaveLength(3);
    expect((await q('?assignee[$ne]=x')).status).toBe(200);
  });

  it('combines filters', async () => {
    expect(idsOf(await q('?search=alpha&status=in-progress&assignee=me', team.developer))).toEqual([ids.beta]);
    expect(idsOf(await q('?search=alpha&status=completed'))).toEqual([]);
  });

  it('keeps workspaces apart', async () => {
    const mine = await list('', owner(), slug);
    expect(idsOf(mine)).not.toContain(ids.alpha);
    const theirs = await list('', outsider, foreignSlug);
    expect(idsOf(theirs)).not.toContain(ids.alpha);
  });
});
