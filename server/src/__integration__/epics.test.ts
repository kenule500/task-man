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
  outsider = await registerUser('Eve Epic Outsider');
  foreignSlug = (await createWorkspace(outsider, 'Foreign Epics')).slug;
});

const projectsUrl = () => `/api/workspaces/${slug}/projects`;
const createProject = async () => {
  const res = await http().post(projectsUrl()).set(bearer(team.owner.token)).send({ name: `Epics ${unknownId().slice(0, 6)}` });
  expect(res.status).toBe(201);
  return res.body as { _id: string; name: string };
};
const createSprint = async (projectId: string) => {
  const res = await http().post(`${projectsUrl()}/${projectId}/sprints`).set(bearer(team.owner.token))
    .send({ name: 'Sprint 1', startDate: '2030-01-06', endDate: '2030-01-19' });
  expect(res.status).toBe(201);
  return res.body as { _id: string };
};
const update = (id: string, body: object, user: TestUser = team.owner, where = slug) =>
  http().patch(`${tasksUrl(where)}/${id}`).set(bearer(user.token)).send(body);
const bulkPatch = (body: object, user: TestUser = team.owner) =>
  http().patch(`${tasksUrl(slug)}/bulk`).set(bearer(user.token)).send(body);
const listTasks = async (query = '', where = slug, user: TestUser = team.owner) =>
  (await http().get(`${tasksUrl(where)}${query}`).set(bearer(user.token))).body as { _id: string; [key: string]: any }[];
const taskOf = async (id: string) => (await listTasks()).find(task => task._id === id);
const createEpic = (overrides: Record<string, unknown> = {}) =>
  createTask(team.owner, slug, { title: 'Checkout revamp', type: 'epic', ...overrides });

describe('epics', () => {
  it('creates an epic and links items to it, taking over the epic project', async () => {
    const project = await createProject();
    const epic = await createEpic({ project: project.name });
    expect(epic).toMatchObject({ type: 'epic', epic: null, sprint: null });

    const story = await createTask(team.owner, slug, { title: 'Pay with card', type: 'story', epic: epic._id });
    expect(story).toMatchObject({ epic: epic._id, project: project.name });

    const bug = await createTask(team.owner, slug, { title: 'Fix total', type: 'bug', project: project.name, epic: epic._id });
    expect(bug.epic).toBe(epic._id);

    const items = await listTasks(`?epic=${epic._id}`);
    expect(items.map(item => item._id).sort()).toEqual([story._id, bug._id].sort());
  });

  it('links and unlinks an existing item through an update and audits the change', async () => {
    const epic = await createEpic();
    const task = await createTask(team.owner, slug);

    const linked = await update(task._id, { epic: epic._id });
    expect(linked.status).toBe(200);
    expect(linked.body.epic).toBe(epic._id);

    const audit = (await http().get(`${tasksUrl(slug)}/${task._id}/activity`).set(bearer(team.owner.token))).body.items as
      { changes: { field: string; to?: string }[] }[];
    expect(audit[0].changes).toEqual(expect.arrayContaining([{ field: 'epic', to: epic._id }]));

    const unlinked = await update(task._id, { epic: null });
    expect(unlinked.status).toBe(200);
    expect(unlinked.body.epic).toBeNull();
    expect((await listTasks('?epic=none')).some(item => item._id === task._id)).toBe(true);
  });

  it('rejects invalid epics, epics of other workspaces and non-epic targets', async () => {
    const task = await createTask(team.owner, slug);
    const story = await createTask(team.owner, slug, { type: 'story' });
    const foreignEpic = (await http().post(tasksUrl(foreignSlug)).set(bearer(outsider.token))
      .send({ title: 'Foreign epic', type: 'epic', deadline: '2030-06-15' })).body;

    expect((await update(task._id, { epic: 'nope' })).status).toBe(400);
    expect((await update(task._id, { epic: { $ne: null } })).status).toBe(400);
    expect((await update(task._id, { epic: unknownId() })).status).toBe(400);
    expect((await update(task._id, { epic: story._id })).status).toBe(400);
    expect((await update(task._id, { epic: foreignEpic._id })).status).toBe(400);
    expect((await update(task._id, { epic: task._id })).status).toBe(400);
    expect((await taskOf(task._id))?.epic).toBeNull();
  });

  it('keeps items and epics in the same project', async () => {
    const projectA = await createProject();
    const projectB = await createProject();
    const epic = await createEpic({ project: projectA.name });
    const other = await createTask(team.owner, slug, { project: projectB.name });

    const mismatch = await update(other._id, { epic: epic._id });
    expect(mismatch.status).toBe(400);
    expect(mismatch.body.message).toMatch(/another project/i);

    const linked = await createTask(team.owner, slug, { epic: epic._id });
    const moved = await update(linked._id, { project: projectB.name });
    expect(moved.status).toBe(400);
    expect((await taskOf(linked._id))?.project).toBe(projectA.name);
  });

  it('keeps epics as containers: no epic, parent, subtasks or sprint', async () => {
    const project = await createProject();
    const sprint = await createSprint(project._id);
    const epic = await createEpic({ project: project.name });
    const otherEpic = await createEpic({ title: 'Other epic', project: project.name });
    const story = await createTask(team.owner, slug, { type: 'story', project: project.name });

    // cycles and nesting
    expect((await update(epic._id, { epic: otherEpic._id })).status).toBe(400);
    expect((await update(epic._id, { epic: epic._id })).status).toBe(400);
    expect((await update(epic._id, { parent: story._id })).status).toBe(400);
    expect((await update(story._id, { parent: epic._id })).status).toBe(400);
    expect((await http().post(tasksUrl(slug)).set(bearer(team.owner.token))
      .send({ title: 'Sub of epic', deadline: '2030-06-15', parent: epic._id })).status).toBe(400);
    expect((await http().post(tasksUrl(slug)).set(bearer(team.owner.token))
      .send({ title: 'Epic in epic', type: 'epic', deadline: '2030-06-15', epic: epic._id })).status).toBe(400);

    // sprints
    const planned = await update(epic._id, { sprint: sprint._id });
    expect(planned.status).toBe(400);
    expect(planned.body.message).toMatch(/epics cannot be planned in a sprint/i);
    expect((await http().post(tasksUrl(slug)).set(bearer(team.owner.token))
      .send({ title: 'Sprint epic', type: 'epic', deadline: '2030-06-15', sprint: sprint._id })).status).toBe(400);
    expect((await bulkPatch({ ids: [epic._id], patch: { sprint: sprint._id } })).status).toBe(400);
  });

  it('makes subtasks inherit the epic of their parent', async () => {
    const epic = await createEpic();
    const parent = await createTask(team.owner, slug, { type: 'story', epic: epic._id });
    const sub = await createTask(team.owner, slug, { title: 'Sub', parent: parent._id });
    expect(sub.epic).toBe(epic._id);

    const direct = await update(sub._id, { epic: (await createEpic({ title: 'Elsewhere' }))._id });
    expect(direct.status).toBe(400);

    // moving the parent to another epic carries its subtasks along
    const next = await createEpic({ title: 'Next epic' });
    expect((await update(parent._id, { epic: next._id })).status).toBe(200);
    expect((await taskOf(sub._id))?.epic).toBe(next._id);

    expect((await update(parent._id, { epic: null })).status).toBe(200);
    expect((await taskOf(sub._id))?.epic).toBeNull();
  });

  it('refuses to change the type of an epic that still has items, or of a task with subtasks', async () => {
    const epic = await createEpic();
    const item = await createTask(team.owner, slug, { epic: epic._id });

    const blocked = await update(epic._id, { type: 'story' });
    expect(blocked.status).toBe(400);
    expect(blocked.body.message).toBe('Move its items first');
    expect((await taskOf(epic._id))?.type).toBe('epic');

    expect((await update(item._id, { epic: null })).status).toBe(200);
    expect((await update(epic._id, { type: 'story' })).status).toBe(200);

    const parent = await createTask(team.owner, slug, { type: 'story' });
    await createTask(team.owner, slug, { parent: parent._id });
    expect((await update(parent._id, { type: 'epic' })).status).toBe(400);
  });

  it('turns an item into an epic and drops its old epic', async () => {
    const epic = await createEpic();
    const item = await createTask(team.owner, slug, { type: 'story', epic: epic._id });
    const converted = await update(item._id, { type: 'epic' });
    expect(converted.status).toBe(200);
    expect(converted.body).toMatchObject({ type: 'epic', epic: null });
  });

  it('deleting an epic keeps its items and clears their epic', async () => {
    const epic = await createEpic();
    const item = await createTask(team.owner, slug, { epic: epic._id });
    const doomed = await createEpic({ title: 'Bulk doomed' });
    const bulkItem = await createTask(team.owner, slug, { epic: doomed._id });

    expect((await http().delete(`${tasksUrl(slug)}/${epic._id}`).set(bearer(team.owner.token))).status).toBe(200);
    expect(await taskOf(item._id)).toMatchObject({ epic: null, title: item.title });

    const bulk = await http().post(`${tasksUrl(slug)}/bulk-delete`).set(bearer(team.owner.token)).send({ ids: [doomed._id] });
    expect(bulk.status).toBe(200);
    expect(await taskOf(bulkItem._id)).toMatchObject({ epic: null });
  });

  it('sets and clears the epic on several items at once', async () => {
    const project = await createProject();
    const epic = await createEpic({ project: project.name });
    const a = await createTask(team.owner, slug, { project: project.name });
    const b = await createTask(team.owner, slug);

    const res = await bulkPatch({ ids: [a._id, b._id], patch: { epic: epic._id } });
    expect(res.status).toBe(200);
    for (const task of res.body.tasks) expect(task).toMatchObject({ epic: epic._id, project: project.name });

    const cleared = await bulkPatch({ ids: [a._id, b._id], patch: { epic: null } });
    expect(cleared.status).toBe(200);
    expect((await taskOf(a._id))?.epic).toBeNull();
  });

  it('bulk epic changes are all-or-nothing and follow the same rules', async () => {
    const projectA = await createProject();
    const projectB = await createProject();
    const epic = await createEpic({ project: projectA.name });
    const fine = await createTask(team.owner, slug, { project: projectA.name });
    const wrongProject = await createTask(team.owner, slug, { project: projectB.name });
    const parent = await createTask(team.owner, slug);
    const sub = await createTask(team.owner, slug, { parent: parent._id });

    expect((await bulkPatch({ ids: [fine._id, wrongProject._id], patch: { epic: epic._id } })).status).toBe(400);
    expect((await taskOf(fine._id))?.epic).toBeNull();
    expect((await bulkPatch({ ids: [sub._id], patch: { epic: epic._id } })).status).toBe(400);
    expect((await bulkPatch({ ids: [epic._id], patch: { epic: epic._id } })).status).toBe(400);
    expect((await bulkPatch({ ids: [fine._id], patch: { epic: 'nope' } })).status).toBe(400);
    expect((await bulkPatch({ ids: [fine._id], patch: { epic: { $ne: null } } })).status).toBe(400);

    // bulk type changes keep the epic rules
    expect((await bulkPatch({ ids: [parent._id], patch: { type: 'epic' } })).status).toBe(400);
    const linked = await createTask(team.owner, slug, { epic: epic._id });
    expect(linked.epic).toBe(epic._id);
    expect((await bulkPatch({ ids: [epic._id], patch: { type: 'story' } })).status).toBe(400);
  });

  it('sets the epic for bulk-moved items into a sprint of the same project only', async () => {
    const projectA = await createProject();
    const projectB = await createProject();
    const epic = await createEpic({ project: projectA.name });
    const item = await createTask(team.owner, slug, { epic: epic._id });
    const wrongSprint = await createSprint(projectB._id);
    expect((await bulkPatch({ ids: [item._id], patch: { sprint: wrongSprint._id } })).status).toBe(400);
    const rightSprint = await createSprint(projectA._id);
    expect((await bulkPatch({ ids: [item._id], patch: { sprint: rightSprint._id } })).status).toBe(200);
  });

  it('does not count epics in sprint velocity', async () => {
    const project = await createProject();
    const sprint = await createSprint(project._id);
    const epic = await createEpic({ project: project.name, storyPoints: 40, status: 'completed' });
    const story = await createTask(team.owner, slug, { sprint: sprint._id, storyPoints: 5, status: 'completed', epic: epic._id });
    expect(story.sprint).toBe(sprint._id);

    const started = await http().post(`${projectsUrl()}/${project._id}/sprints/${sprint._id}/start`).set(bearer(team.owner.token));
    expect(started.status).toBe(200);
    const done = await http().post(`${projectsUrl()}/${project._id}/sprints/${sprint._id}/complete`).set(bearer(team.owner.token)).send({});
    expect(done.status).toBe(200);
    expect(done.body.sprint.completedPoints).toBe(5);
  });

  it('enforces task permissions and workspace isolation', async () => {
    const epic = await createEpic();
    const task = await createTask(team.owner, slug);

    const viewerCreate = await http().post(tasksUrl(slug)).set(bearer(team.viewer.token))
      .send({ title: 'Nope', type: 'epic', deadline: '2030-06-15' });
    expect(viewerCreate.status).toBe(403);
    expect((await update(task._id, { epic: epic._id }, team.viewer)).status).toBe(403);
    expect((await update(task._id, { epic: epic._id }, team.developer)).status).toBe(200);
    expect((await listTasks(`?epic=${epic._id}`, slug, team.viewer)).map(item => item._id)).toContain(task._id);

    // another workspace's members cannot read or change this workspace's epics
    expect((await update(epic._id, { title: 'Hijacked' }, outsider)).status).toBe(403);
    expect((await listTasks(`?epic=${epic._id}`, foreignSlug, outsider))).toEqual([]);
  });
});
