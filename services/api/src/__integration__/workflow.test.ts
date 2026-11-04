import {
  bearer, createTask, createTeam, createWorkspace, http, registerUser, startApp, stopApp, tasksUrl, type TestUser,
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

const url = (workspaceSlug = slug) => `/api/workspaces/${workspaceSlug}/workflow`;
const read = (user: TestUser, workspaceSlug = slug) => http().get(url(workspaceSlug)).set(bearer(user.token));
const save = (user: TestUser, body: Record<string, unknown>, workspaceSlug = slug) =>
  http().put(url(workspaceSlug)).set(bearer(user.token)).send(body);
const patchTask = (user: TestUser, id: string, body: Record<string, unknown>, workspaceSlug = slug) =>
  http().patch(`${tasksUrl(workspaceSlug)}/${id}`).set(bearer(user.token)).send(body);

const stage = (key: string, group: string, extra: Record<string, unknown> = {}) => ({
  key, name: key.replace(/-/g, ' '), group, ...extra,
});

const scrum = [
  stage('todo', 'pending'),
  stage('doing', 'in-progress'),
  stage('review', 'in-progress', { color: 'violet', wipLimit: 2 }),
  stage('qa', 'in-progress'),
  stage('done', 'completed'),
];

describe('workflow: defaults and access', () => {
  it('serves the default three stages to any member', async () => {
    const res = await read(team.viewer);
    expect(res.status).toBe(200);
    expect(res.body.stages.map((s: { key: string; group: string }) => [s.key, s.group])).toEqual([
      ['todo', 'pending'], ['in-progress', 'in-progress'], ['done', 'completed'],
    ]);
  });

  it('requires a session and membership', async () => {
    expect((await http().get(url())).status).toBe(401);
    expect((await read(outsider)).status).toBe(403);
  });

  it('lets only settings managers change the workflow', async () => {
    expect((await save(team.viewer, { stages: scrum })).status).toBe(403);
    expect((await save(team.developer, { stages: scrum })).status).toBe(403);
    expect((await save(outsider, { stages: scrum })).status).toBe(403);
  });
});

describe('workflow: validation', () => {
  it('rejects duplicate keys, a group without stages and more than 12 stages', async () => {
    const duplicate = await save(team.owner, { stages: [...scrum, stage('todo', 'pending')] });
    expect(duplicate.status).toBe(400);
    expect(duplicate.body.message).toMatch(/unique/i);

    const emptyGroup = await save(team.owner, { stages: [stage('todo', 'pending'), stage('done', 'completed')] });
    expect(emptyGroup.status).toBe(400);
    expect(emptyGroup.body.message).toMatch(/in-progress/);

    const groups = ['pending', 'in-progress', 'completed'];
    const many = Array.from({ length: 13 }, (_, i) => stage(`s${i}`, groups[i % 3]));
    expect((await save(team.owner, { stages: many })).status).toBe(400);
    expect((await save(team.owner, { stages: many.slice(0, 12) })).status).toBe(200);
    expect((await save(team.owner, { stages: [] })).status).toBe(400);
  });

  it('rejects bad keys, colors, limits and operator objects', async () => {
    const withFirst = (first: Record<string, unknown>) => ({ stages: [first, stage('doing', 'in-progress'), stage('done', 'completed')] });
    expect((await save(team.owner, withFirst(stage('To Do', 'pending')))).status).toBe(400);
    expect((await save(team.owner, withFirst(stage('todo', 'blocked')))).status).toBe(400);
    expect((await save(team.owner, withFirst(stage('todo', 'pending', { color: 'pink' })))).status).toBe(400);
    expect((await save(team.owner, withFirst(stage('todo', 'pending', { wipLimit: 1000 })))).status).toBe(400);
    expect((await save(team.owner, withFirst({ ...stage('todo', 'pending'), key: { $ne: 'x' } }))).status).toBe(400);
    expect((await save(team.owner, { stages: scrum, moves: 'x' })).status).toBe(400);
    expect((await save(team.owner, { stages: 'x' })).status).toBe(400);
  });

  it('keeps the previous workflow after a rejected change', async () => {
    expect((await save(team.owner, { stages: scrum })).status).toBe(200);
    expect((await save(team.owner, { stages: [stage('only', 'pending')] })).status).toBe(400);
    const res = await read(team.viewer);
    expect(res.body.stages.map((s: { key: string }) => s.key)).toEqual(['todo', 'doing', 'review', 'qa', 'done']);
  });
});

describe('workflow: tasks follow the stages', () => {
  beforeAll(async () => {
    expect((await save(team.owner, { stages: scrum })).status).toBe(200);
  });

  it('stores the stages in order with their color and limit', async () => {
    const res = await read(team.developer);
    expect(res.body.stages[2]).toEqual({ key: 'review', name: 'review', group: 'in-progress', color: 'violet', wipLimit: 2 });
  });

  it('creates tasks in the first stage of their status', async () => {
    const plain = await createTask(team.developer, slug);
    expect(plain).toMatchObject({ status: 'pending', stage: 'todo' });
    const completed = await createTask(team.developer, slug, { status: 'completed' });
    expect(completed).toMatchObject({ status: 'completed', stage: 'done' });
    const staged = await createTask(team.developer, slug, { stage: 'qa' });
    expect(staged).toMatchObject({ status: 'in-progress', stage: 'qa' });
  });

  it('rejects an unknown stage on create and update', async () => {
    const res = await http().post(tasksUrl(slug)).set(bearer(team.developer.token))
      .send({ title: 'x', deadline: '2030-06-15', stage: 'nope' });
    expect(res.status).toBe(400);
    const task = await createTask(team.developer, slug);
    expect((await patchTask(team.developer, task._id, { stage: 'nope' })).status).toBe(400);
    expect((await patchTask(team.developer, task._id, { stage: { $ne: 'todo' } })).status).toBe(400);
  });

  it('moving a task to the review stage sets the in-progress status', async () => {
    const task = await createTask(team.developer, slug);
    const res = await patchTask(team.developer, task._id, { stage: 'review' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'in-progress', stage: 'review' });
  });

  it('a status-only change keeps a stage in that group, else picks its first stage', async () => {
    const task = await createTask(team.developer, slug, { stage: 'review' });
    const same = await patchTask(team.developer, task._id, { status: 'in-progress' });
    expect(same.body).toMatchObject({ status: 'in-progress', stage: 'review' });
    const done = await patchTask(team.developer, task._id, { status: 'completed' });
    expect(done.body).toMatchObject({ status: 'completed', stage: 'done' });
    expect(done.body.completedAt).toBeTruthy();
    const back = await patchTask(team.developer, task._id, { status: 'in-progress' });
    expect(back.body).toMatchObject({ status: 'in-progress', stage: 'doing' });
    expect(back.body.completedAt).toBeUndefined();
  });

  it('lets an explicit stage win over a conflicting status', async () => {
    const task = await createTask(team.developer, slug);
    const res = await patchTask(team.developer, task._id, { stage: 'done', status: 'pending' });
    expect(res.body).toMatchObject({ status: 'completed', stage: 'done' });
  });

  it('updates the stage of several tasks in bulk', async () => {
    const first = await createTask(team.developer, slug);
    const second = await createTask(team.developer, slug, { status: 'completed' });
    const res = await http().patch(`${tasksUrl(slug)}/bulk`).set(bearer(team.developer.token))
      .send({ ids: [first._id, second._id], patch: { stage: 'qa' } });
    expect(res.status).toBe(200);
    expect(res.body.tasks.map((t: { status: string; stage: string }) => [t.status, t.stage])).toEqual([
      ['in-progress', 'qa'], ['in-progress', 'qa'],
    ]);

    const status = await http().patch(`${tasksUrl(slug)}/bulk`).set(bearer(team.developer.token))
      .send({ ids: [first._id], patch: { status: 'pending' } });
    expect(status.body.tasks[0]).toMatchObject({ status: 'pending', stage: 'todo' });

    const bad = await http().patch(`${tasksUrl(slug)}/bulk`).set(bearer(team.developer.token))
      .send({ ids: [first._id], patch: { stage: 'nope' } });
    expect(bad.status).toBe(400);
  });

  it('records stage moves in the activity log', async () => {
    const task = await createTask(team.developer, slug, { stage: 'review' });
    await patchTask(team.developer, task._id, { stage: 'qa' });
    const res = await http().get(`${tasksUrl(slug)}/${task._id}/activity`).set(bearer(team.developer.token));
    expect(res.status).toBe(200);
    const fields = res.body.items.flatMap((entry: { changes?: { field: string }[] }) => (entry.changes ?? []).map(change => change.field));
    expect(fields).toContain('stage');
  });
});

describe('workflow: removing a stage', () => {
  it('moves its tasks to the first stage of the group, or to the chosen stage', async () => {
    expect((await save(team.owner, { stages: scrum })).status).toBe(200);
    const inReview = await createTask(team.developer, slug, { stage: 'review' });
    const inQa = await createTask(team.developer, slug, { stage: 'qa' });
    const inQa2 = await createTask(team.developer, slug, { stage: 'qa' });

    const withoutReviewAndQa = [stage('todo', 'pending'), stage('doing', 'in-progress'), stage('done', 'completed')];
    const res = await save(team.owner, { stages: withoutReviewAndQa, moves: { qa: 'doing' } });
    expect(res.status).toBe(200);
    expect(res.body.stages.map((s: { key: string }) => s.key)).toEqual(['todo', 'doing', 'done']);

    const list = await http().get(tasksUrl(slug)).set(bearer(team.owner.token));
    const byId = new Map<string, { stage: string; status: string }>(list.body.map((t: { _id: string; stage: string; status: string }) => [t._id, t]));
    expect(byId.get(inReview._id)).toMatchObject({ stage: 'doing', status: 'in-progress' });
    expect(byId.get(inQa._id)).toMatchObject({ stage: 'doing', status: 'in-progress' });
    expect(byId.get(inQa2._id)).toMatchObject({ stage: 'doing', status: 'in-progress' });
  });

  it('can move the tasks of a removed stage into another group', async () => {
    expect((await save(team.owner, { stages: scrum })).status).toBe(200);
    const task = await createTask(team.developer, slug, { stage: 'qa' });
    const kept = await createTask(team.developer, slug, { stage: 'review' });
    const rest = scrum.filter(item => item.key !== 'qa');
    const res = await save(team.owner, { stages: rest, moves: { qa: 'done' } });
    expect(res.status).toBe(200);
    const list = await http().get(tasksUrl(slug)).set(bearer(team.owner.token));
    const find = (id: string) => list.body.find((t: { _id: string }) => t._id === id);
    expect(find(task._id)).toMatchObject({ stage: 'done', status: 'completed' });
    expect(find(kept._id)).toMatchObject({ stage: 'review', status: 'in-progress' });
    expect((await save(team.owner, { stages: rest, moves: { qa: 'ghost' } })).status).toBe(400);
  });

  it('moves the tasks of a stage along when the stage changes group', async () => {
    expect((await save(team.owner, { stages: scrum })).status).toBe(200);
    const task = await createTask(team.developer, slug, { stage: 'qa' });
    const regrouped = scrum.map(item => (item.key === 'qa' ? { ...item, group: 'completed' } : item));
    expect((await save(team.owner, { stages: regrouped })).status).toBe(200);
    const list = await http().get(tasksUrl(slug)).set(bearer(team.owner.token));
    expect(list.body.find((t: { _id: string }) => t._id === task._id)).toMatchObject({ stage: 'qa', status: 'completed' });
  });

  it('records a workflow.updated activity', async () => {
    const res = await http().get(`/api/workspaces/${slug}/activity`).set(bearer(team.owner.token));
    expect(res.status).toBe(200);
    expect(res.body.items.some((entry: { action: string }) => entry.action === 'workflow.updated')).toBe(true);
  });
});

describe('workflow: workspace isolation', () => {
  it('keeps the stages and tasks of another workspace untouched', async () => {
    const other = await createWorkspace(outsider, 'Elsewhere');
    expect((await save(team.owner, { stages: scrum })).status).toBe(200);
    expect((await read(outsider, other.slug)).body.stages.map((s: { key: string }) => s.key)).toEqual(['todo', 'in-progress', 'done']);

    const foreign = await createTask(outsider, other.slug, { stage: 'in-progress' });
    expect(foreign).toMatchObject({ stage: 'in-progress', status: 'in-progress' });
    expect((await patchTask(outsider, foreign._id, { stage: 'review' }, other.slug)).status).toBe(400);

    // The same key in two workspaces: removing it in one does not touch the other
    await save(team.owner, { stages: [stage('todo', 'pending'), stage('done', 'completed'), stage('doing', 'in-progress')] });
    await save(team.owner, { stages: [stage('todo', 'pending'), stage('in-progress', 'in-progress'), stage('done', 'completed')] });
    const after = await http().get(`${tasksUrl(other.slug)}`).set(bearer(outsider.token));
    expect(after.body.find((t: { _id: string }) => t._id === foreign._id)).toMatchObject({ stage: 'in-progress', status: 'in-progress' });

    // A member of one workspace cannot read or change the other's workflow
    expect((await read(team.owner, other.slug)).status).toBe(403);
    expect((await save(team.owner, { stages: scrum }, other.slug)).status).toBe(403);
  });
});
