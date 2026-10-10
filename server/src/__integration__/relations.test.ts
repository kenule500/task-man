import {
  bearer, createTask, createTeam, createWorkspace, http, registerUser, startApp, stopApp, tasksUrl, unknownId,
  type TestUser,
} from './harness.js';

beforeAll(startApp);
afterAll(stopApp);

type Team = Awaited<ReturnType<typeof createTeam>>;
type Row = { _id: string; [key: string]: any };
let team: Team;
let slug: string;
let foreignSlug: string;
let outsider: TestUser;

beforeAll(async () => {
  team = await createTeam();
  slug = team.workspace.slug;
  outsider = await registerUser('Rita Relations Outsider');
  foreignSlug = (await createWorkspace(outsider, 'Foreign Relations')).slug;
});

const link = (id: string, body: Record<string, unknown>, user: TestUser = team.developer, where = slug) =>
  http().post(`${tasksUrl(where)}/${id}/relations`).set(bearer(user.token)).send(body);
const unlink = (id: string, relatedId: string, type: string, user: TestUser = team.developer) =>
  http().delete(`${tasksUrl(slug)}/${id}/relations/${relatedId}?type=${type}`).set(bearer(user.token));
const move = (id: string, parent: string | null, user: TestUser = team.developer) =>
  http().post(`${tasksUrl(slug)}/${id}/move`).set(bearer(user.token)).send({ parent });
const listTasks = async (where = slug, user: TestUser = team.owner) =>
  (await http().get(tasksUrl(where)).set(bearer(user.token))).body as Row[];
const taskOf = async (id: string) => (await listTasks()).find(task => task._id === id) as Row;
const auditOf = async (id: string) =>
  (await http().get(`${tasksUrl(slug)}/${id}/activity`).set(bearer(team.owner.token))).body.items as
    { action: string; changes: { field: string; from?: string; to?: string }[] }[];
const relationsOf = async (id: string) => ((await taskOf(id)).relations ?? []) as { type: string; task: string }[];

describe('issue links', () => {
  it('writes both sides of a relation with the inverse type', async () => {
    const a = await createTask(team.owner, slug, { title: 'Link A' });
    const b = await createTask(team.owner, slug, { title: 'Link B' });
    const res = await link(a._id, { type: 'duplicates', task: b._id });
    expect(res.status).toBe(201);
    expect(res.body.task.relations).toEqual([{ type: 'duplicates', task: b._id }]);
    expect(res.body.related.relations).toEqual([{ type: 'duplicated_by', task: a._id }]);

    const c = await createTask(team.owner, slug, { title: 'Link C' });
    expect((await link(a._id, { type: 'relates', task: c._id })).status).toBe(201);
    expect(await relationsOf(c._id)).toEqual([{ type: 'relates', task: a._id }]);

    const d = await createTask(team.owner, slug, { title: 'Link D' });
    expect((await link(d._id, { type: 'cloned_by', task: a._id })).status).toBe(201);
    expect(await relationsOf(a._id)).toContainEqual({ type: 'clones', task: d._id });
  });

  it('rejects self links, repeats, unknown types and bad ids', async () => {
    const a = await createTask(team.owner, slug, { title: 'Strict A' });
    const b = await createTask(team.owner, slug, { title: 'Strict B' });
    expect((await link(a._id, { type: 'relates', task: a._id })).status).toBe(400);
    expect((await link(a._id, { type: 'relates', task: b._id })).status).toBe(201);
    expect((await link(a._id, { type: 'relates', task: b._id })).status).toBe(400);
    expect((await link(b._id, { type: 'relates', task: a._id })).status).toBe(400);
    // A different type between the same tasks is a separate link
    expect((await link(a._id, { type: 'clones', task: b._id })).status).toBe(201);
    expect((await link(a._id, { type: 'friends', task: b._id })).status).toBe(400);
    expect((await link(a._id, { type: 'relates', task: 'nope' })).status).toBe(400);
    expect((await link(a._id, { type: { $ne: 'x' }, task: b._id })).status).toBe(400);
    expect((await link(a._id, { type: 'relates', task: unknownId() })).status).toBe(404);
    expect((await link(unknownId(), { type: 'relates', task: b._id })).status).toBe(404);
  });

  it('rejects tasks of another workspace', async () => {
    const mine = await createTask(team.owner, slug, { title: 'Mine' });
    const foreign = await createTask(outsider, foreignSlug, { title: 'Theirs' });
    const res = await link(mine._id, { type: 'relates', task: foreign._id });
    expect(res.status).toBe(404);
    expect(await relationsOf(mine._id)).toEqual([]);
    expect((await link(foreign._id, { type: 'relates', task: mine._id }, team.owner)).status).toBe(404);
    expect((await link(foreign._id, { type: 'relates', task: mine._id }, outsider, foreignSlug)).status).toBe(404);
  });

  it('maps blocks and blocked_by onto dependencies and rejects cycles', async () => {
    const a = await createTask(team.owner, slug, { title: 'Blocked task' });
    const b = await createTask(team.owner, slug, { title: 'Blocker' });
    const c = await createTask(team.owner, slug, { title: 'Second blocked' });

    expect((await link(a._id, { type: 'blocked_by', task: b._id })).status).toBe(201);
    expect((await taskOf(a._id)).dependencies).toEqual([b._id]);
    expect(await relationsOf(a._id)).toEqual([]);

    expect((await link(b._id, { type: 'blocks', task: c._id })).status).toBe(201);
    expect((await taskOf(c._id)).dependencies).toEqual([b._id]);

    // The same dependency again, from the other side
    expect((await link(b._id, { type: 'blocks', task: a._id })).status).toBe(400);
    // b blocked by a (a is already blocked by b) would be a cycle
    const cycle = await link(b._id, { type: 'blocked_by', task: a._id });
    expect(cycle.status).toBe(400);
    expect(cycle.body.message).toMatch(/cycle/i);
    expect((await link(a._id, { type: 'blocks', task: b._id })).status).toBe(400);
    // Longer cycle: c waits for b, a waits for b; b waiting for c would loop
    expect((await link(b._id, { type: 'blocked_by', task: c._id })).status).toBe(400);
    expect((await taskOf(b._id)).dependencies).toEqual([]);
  });

  it('removes both sides, and the dependency for blocks', async () => {
    const a = await createTask(team.owner, slug, { title: 'Unlink A' });
    const b = await createTask(team.owner, slug, { title: 'Unlink B' });
    await link(a._id, { type: 'duplicates', task: b._id });

    expect((await unlink(a._id, b._id, 'relates')).status).toBe(404);
    expect((await unlink(a._id, b._id, 'weird')).status).toBe(400);
    const removed = await unlink(b._id, a._id, 'duplicated_by');
    expect(removed.status).toBe(200);
    expect(removed.body.task.relations).toEqual([]);
    expect(removed.body.related.relations).toEqual([]);
    expect(await relationsOf(a._id)).toEqual([]);

    await link(a._id, { type: 'blocks', task: b._id });
    expect((await taskOf(b._id)).dependencies).toEqual([a._id]);
    expect((await unlink(b._id, a._id, 'blocked_by')).status).toBe(200);
    expect((await taskOf(b._id)).dependencies).toEqual([]);
  });

  it('records activity on both tasks', async () => {
    const a = await createTask(team.owner, slug, { title: 'Audit A' });
    const b = await createTask(team.owner, slug, { title: 'Audit B' });
    await link(a._id, { type: 'clones', task: b._id });

    const forA = (await auditOf(a._id)).find(entry => entry.changes.some(change => change.field === 'relations'));
    const forB = (await auditOf(b._id)).find(entry => entry.changes.some(change => change.field === 'relations'));
    expect(forA?.action).toBe('task.updated');
    expect(forA?.changes[0].to).toMatch(/^clones [A-Z0-9]+-\d+$/);
    expect(forB?.changes[0].to).toMatch(/^cloned_by [A-Z0-9]+-\d+$/);

    await unlink(a._id, b._id, 'clones');
    const removed = (await auditOf(a._id)).find(entry => entry.changes.some(change => change.field === 'relations' && change.from));
    expect(removed?.changes[0].from).toMatch(/^clones /);
  });

  it('pulls a deleted task from the links of the others', async () => {
    const a = await createTask(team.owner, slug, { title: 'Survivor' });
    const b = await createTask(team.owner, slug, { title: 'Doomed' });
    await link(a._id, { type: 'relates', task: b._id });
    expect(await relationsOf(a._id)).toHaveLength(1);

    const deleted = await http().delete(`${tasksUrl(slug)}/${b._id}`).set(bearer(team.owner.token));
    expect(deleted.status).toBe(200);
    expect(await relationsOf(a._id)).toEqual([]);
  });

  it('is forbidden for viewers and non-members, readable by everyone who can read tasks', async () => {
    const a = await createTask(team.owner, slug, { title: 'Perm A' });
    const b = await createTask(team.owner, slug, { title: 'Perm B' });
    expect((await link(a._id, { type: 'relates', task: b._id }, team.viewer)).status).toBe(403);
    expect((await link(a._id, { type: 'relates', task: b._id }, outsider)).status).toBe(403);
    await link(a._id, { type: 'relates', task: b._id }, team.productOwner);
    expect((await unlink(a._id, b._id, 'relates', team.viewer)).status).toBe(403);
    const seen = (await listTasks(slug, team.viewer)).find(task => task._id === a._id) as Row;
    expect(seen.relations).toEqual([{ type: 'relates', task: b._id }]);
  });
});

describe('convert to subtask and promote', () => {
  const projectsUrl = () => `/api/workspaces/${slug}/projects`;
  const createProject = async () => {
    const res = await http().post(projectsUrl()).set(bearer(team.owner.token)).send({ name: `Move ${unknownId().slice(0, 6)}` });
    expect(res.status).toBe(201);
    return res.body as { _id: string; name: string };
  };
  const createSprint = async (projectId: string) => {
    const res = await http().post(`${projectsUrl()}/${projectId}/sprints`).set(bearer(team.owner.token))
      .send({ name: 'Sprint 1', startDate: '2030-01-06', endDate: '2030-01-19' });
    expect(res.status).toBe(201);
    return res.body as { _id: string };
  };

  it('converts a task into a subtask that takes the project, sprint and epic of its parent', async () => {
    const project = await createProject();
    const sprint = await createSprint(project._id);
    const epic = await createTask(team.owner, slug, { title: 'Big epic', type: 'epic', project: project.name });
    const parent = await createTask(team.owner, slug, { title: 'Parent', project: project.name, sprint: sprint._id, epic: epic._id });
    const loose = await createTask(team.owner, slug, {
      title: 'Loose', recurrence: { every: 1, unit: 'week', basis: 'due' },
    });

    const res = await move(loose._id, parent._id);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ parent: parent._id, project: project.name, sprint: sprint._id, epic: epic._id, recurrence: null });

    const entry = (await auditOf(loose._id)).find(item => item.changes.some(change => change.field === 'parent'));
    expect(entry?.changes.find(change => change.field === 'parent')).toMatchObject({ to: expect.stringContaining('Parent') });
  });

  it('applies the subtask rules', async () => {
    const parent = await createTask(team.owner, slug, { title: 'Rules parent' });
    const sub = await createTask(team.owner, slug, { title: 'Rules sub', parent: parent._id });
    const holder = await createTask(team.owner, slug, { title: 'Has a child' });
    await createTask(team.owner, slug, { title: 'Child', parent: holder._id });
    const epic = await createTask(team.owner, slug, { title: 'Rules epic', type: 'epic' });
    const plain = await createTask(team.owner, slug, { title: 'Plain' });
    const foreign = await createTask(outsider, foreignSlug, { title: 'Foreign parent' });

    expect((await move(plain._id, plain._id)).status).toBe(400);
    expect((await move(plain._id, sub._id)).status).toBe(400);
    expect((await move(plain._id, epic._id)).status).toBe(400);
    expect((await move(epic._id, parent._id)).status).toBe(400);
    expect((await move(holder._id, parent._id)).status).toBe(400);
    expect((await move(sub._id, parent._id)).status).toBe(400);
    expect((await move(plain._id, foreign._id)).status).toBe(400);
    expect((await move(plain._id, unknownId())).status).toBe(400);
    expect((await move(unknownId(), parent._id)).status).toBe(404);
    expect((await move(plain._id, 'nope' as never)).status).toBe(400);
    expect((await http().post(`${tasksUrl(slug)}/${plain._id}/move`).set(bearer(team.owner.token)).send({})).status).toBe(400);
    expect((await taskOf(plain._id)).parent ?? null).toBeNull();
  });

  it('moves a subtask to another parent and promotes it keeping project and sprint', async () => {
    const project = await createProject();
    const sprint = await createSprint(project._id);
    const first = await createTask(team.owner, slug, { title: 'First parent', project: project.name, sprint: sprint._id });
    const second = await createTask(team.owner, slug, { title: 'Second parent' });
    const sub = await createTask(team.owner, slug, { title: 'Travelling', parent: first._id });
    expect(sub).toMatchObject({ project: project.name, sprint: sprint._id });

    const moved = await move(sub._id, second._id);
    expect(moved.status).toBe(200);
    expect(moved.body).toMatchObject({ parent: second._id, project: '' });
    expect(moved.body.sprint ?? null).toBeNull();

    const back = await move(sub._id, first._id);
    expect(back.body).toMatchObject({ parent: first._id, sprint: sprint._id });

    const promoted = await move(sub._id, null);
    expect(promoted.status).toBe(200);
    expect(promoted.body.parent ?? null).toBeNull();
    expect(promoted.body).toMatchObject({ project: project.name, sprint: sprint._id });
    expect((await move(sub._id, null)).status).toBe(400);
  });

  it('is forbidden for viewers', async () => {
    const parent = await createTask(team.owner, slug, { title: 'Viewer parent' });
    const child = await createTask(team.owner, slug, { title: 'Viewer child' });
    expect((await move(child._id, parent._id, team.viewer)).status).toBe(403);
    expect((await move(child._id, parent._id, outsider)).status).toBe(403);
  });
});
