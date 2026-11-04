import {
  bearer, createTask, createTeam, createWorkspace, http, registerUser, startApp, stopApp, tasksUrl, unknownId, type TestUser,
} from './harness.js';

beforeAll(startApp);
afterAll(stopApp);

type Team = Awaited<ReturnType<typeof createTeam>>;
let team: Team;
let slug: string;
let outsider: TestUser;

beforeAll(async () => {
  team = await createTeam();
  slug = team.workspace.slug;
  outsider = await registerUser('Nina Notmember');
});

const url = (id = '', workspace = slug) => `/api/workspaces/${workspace}/automations${id ? `/${id}` : ''}`;
const list = (user: TestUser = team.owner) => http().get(url()).set(bearer(user.token));
const create = (body: Record<string, unknown>, user: TestUser = team.owner, workspace = slug) =>
  http().post(url('', workspace)).set(bearer(user.token)).send(body);
const patchRule = (id: string, body: Record<string, unknown>, user: TestUser = team.owner) =>
  http().patch(url(id)).set(bearer(user.token)).send(body);
const removeRule = (id: string, user: TestUser = team.owner) => http().delete(url(id)).set(bearer(user.token));

const rule = (overrides: Record<string, unknown> = {}) => ({
  name: 'Bugs start high',
  trigger: { type: 'task.created' },
  conditions: [{ field: 'type', op: 'is', value: 'bug' }],
  actions: [{ type: 'set_priority', value: 'high' }],
  ...overrides,
});

const update = (id: string, body: object, user: TestUser = team.owner, workspace = slug) =>
  http().patch(`${tasksUrl(workspace)}/${id}`).set(bearer(user.token)).send(body);
const comment = (id: string, text: string, user: TestUser = team.owner) =>
  http().post(`${tasksUrl(slug)}/${id}/comments`).set(bearer(user.token)).send({ text });

/** The stored task (create and update answer with the state before the rules ran). */
const stored = async (id: string, workspace = slug, user: TestUser = team.owner) => {
  const res = await http().get(tasksUrl(workspace)).set(bearer(user.token));
  const found = (res.body as { _id: string; [key: string]: any }[]).find(task => task._id === id);
  if (!found) throw new Error('task not found');
  return found;
};
const history = async (id: string) =>
  (await http().get(`${tasksUrl(slug)}/${id}/activity`).set(bearer(team.owner.token))).body.items as {
    action: string; summary: string; changes: { field: string; from?: string; to?: string }[];
  }[];

/** Removes every rule so the next test starts clean. */
const clearRules = async () => {
  for (const existing of (await list()).body as { _id: string }[]) await removeRule(existing._id);
};

describe('automations: access', () => {
  it('requires a session and settings:manage', async () => {
    expect((await http().get(url())).status).toBe(401);
    expect((await list(outsider)).status).toBe(403);
    for (const user of [team.viewer, team.developer]) {
      expect((await list(user)).status).toBe(403);
      expect((await create(rule(), user)).status).toBe(403);
      expect((await patchRule(unknownId(), { enabled: false }, user)).status).toBe(403);
      expect((await removeRule(unknownId(), user)).status).toBe(403);
      expect((await http().get(url('templates')).set(bearer(user.token))).status).toBe(403);
    }
  });

  it('serves the templates to the owner', async () => {
    const res = await http().get(url('templates')).set(bearer(team.owner.token));
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(6);
    expect(res.body[0]).toMatchObject({ id: expect.any(String), name: expect.any(String), trigger: { type: expect.any(String) } });
  });
});

describe('automations: CRUD', () => {
  afterAll(clearRules);

  it('creates, lists, toggles, edits and deletes a rule with audit entries', async () => {
    const created = await create(rule());
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      name: 'Bugs start high', enabled: true, project: '', runCount: 0, lastRunAt: null,
      trigger: { type: 'task.created', to: '' },
      conditions: [{ field: 'type', op: 'is', value: 'bug' }],
      actions: [{ type: 'set_priority', value: 'high' }],
      createdBy: { _id: team.owner.id, name: team.owner.name },
    });

    expect((await list()).body.map((item: { name: string }) => item.name)).toContain('Bugs start high');

    const off = await patchRule(created.body._id, { enabled: false });
    expect(off.status).toBe(200);
    expect(off.body.enabled).toBe(false);

    const edited = await patchRule(created.body._id, {
      name: 'Renamed', trigger: { type: 'task.status_changed', to: 'completed' }, conditions: [], actions: [{ type: 'add_label', value: 'done' }],
    });
    expect(edited.body).toMatchObject({ name: 'Renamed', trigger: { type: 'task.status_changed', to: 'completed' }, conditions: [] });

    expect((await removeRule(created.body._id)).status).toBe(200);
    expect((await removeRule(created.body._id)).status).toBe(404);
    expect((await patchRule(created.body._id, { enabled: true })).status).toBe(404);

    const audit = await http().get(`/api/workspaces/${slug}/activity?area=automation`).set(bearer(team.owner.token));
    const actions = (audit.body.items as { action: string }[]).map(item => item.action);
    expect(actions).toEqual(expect.arrayContaining(['automation.created', 'automation.updated', 'automation.deleted']));
  });

  it('rejects invalid rules', async () => {
    const bad: Record<string, unknown>[] = [
      {},
      rule({ name: '' }),
      rule({ name: 'x'.repeat(81) }),
      rule({ trigger: { type: 'task.exploded' } }),
      rule({ trigger: { type: 'task.status_changed', to: 'done' } }),
      rule({ trigger: { type: 'task.created', to: 'x' } }),
      rule({ conditions: [{ field: 'type', op: 'has', value: 'bug' }] }),
      rule({ conditions: Array.from({ length: 6 }, () => ({ field: 'type', op: 'is', value: 'bug' })) }),
      rule({ actions: [] }),
      rule({ actions: Array.from({ length: 6 }, () => ({ type: 'unassign_all' })) }),
      rule({ actions: [{ type: 'set_priority', value: 'urgent' }] }),
      rule({ actions: [{ type: 'add_comment', value: 'x'.repeat(501) }] }),
      rule({ actions: [{ type: 'assign_to', value: 'nobody' }] }),
      rule({ enabled: 'yes' }),
    ];
    for (const body of bad) expect((await create(body)).status).toBe(400);
  });

  it('only assigns to members of the workspace', async () => {
    const stranger = await create(rule({ actions: [{ type: 'assign_to', value: outsider.id }] }));
    expect(stranger.status).toBe(400);
    const member = await create(rule({ name: 'Assign dev', actions: [{ type: 'assign_to', value: team.developer.id }] }));
    expect(member.status).toBe(201);
    expect((await patchRule(member.body._id, { actions: [{ type: 'assign_to', value: outsider.id }] })).status).toBe(400);
    expect((await patchRule('not-an-id', { enabled: false })).status).toBe(404);
  });

  it('caps a workspace at 25 rules', async () => {
    await clearRules();
    for (let index = 0; index < 25; index += 1) {
      expect((await create(rule({ name: `Rule ${index}` }))).status).toBe(201);
    }
    const res = await create(rule({ name: 'One too many' }));
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/25/);
    await clearRules();
  });
});

describe('automations: running', () => {
  beforeEach(clearRules);
  afterAll(clearRules);

  it('fires on creation and writes audit entries and run stats', async () => {
    const created = await create(rule());
    const bug = await createTask(team.owner, slug, { title: 'Crash on save', type: 'bug', priority: 'low' });
    const other = await createTask(team.owner, slug, { title: 'Plain task', type: 'task', priority: 'low' });

    expect((await stored(bug._id)).priority).toBe('high');
    expect((await stored(other._id)).priority).toBe('low');

    const entries = await history(bug._id);
    const ran = entries.find(entry => entry.action === 'automation.ran');
    expect(ran).toMatchObject({ summary: 'Bugs start high', changes: [{ field: 'task', to: 'Crash on save' }] });
    const edit = entries.find(entry => entry.action === 'task.updated');
    expect(edit?.summary).toBe('Crash on save · automation "Bugs start high"');
    expect(edit?.changes).toEqual([{ field: 'priority', from: 'low', to: 'high' }]);

    const after = (await list()).body.find((item: { _id: string }) => item._id === created.body._id);
    expect(after.runCount).toBe(1);
    expect(after.lastRunAt).not.toBeNull();
  });

  it('fires on a status change with a matching value and assigns the actor', async () => {
    await create({
      name: 'Whoever starts it', trigger: { type: 'task.status_changed', to: 'in-progress' },
      conditions: [{ field: 'assignee', op: 'is_empty', value: '' }], actions: [{ type: 'assign_to_actor' }],
    });
    const task = await createTask(team.owner, slug, { title: 'Start me' });
    await update(task._id, { status: 'completed' });
    expect((await stored(task._id)).assignees).toEqual([]);

    await update(task._id, { status: 'in-progress' }, team.developer);
    const done = await stored(task._id);
    expect(done.assignees.map((person: { _id: string }) => person._id)).toEqual([team.developer.id]);

    // Already assigned: the condition no longer matches
    await update(task._id, { status: 'pending' });
    await update(task._id, { status: 'in-progress' }, team.owner);
    expect((await stored(task._id)).assignees).toHaveLength(1);
  });

  it('fires on comments and keeps completedAt in sync', async () => {
    await create({
      name: 'Reopen', trigger: { type: 'task.commented' },
      conditions: [{ field: 'status', op: 'is', value: 'completed' }], actions: [{ type: 'set_status', value: 'in-progress' }],
    });
    const task = await createTask(team.owner, slug, { title: 'Done work', status: 'completed' });
    expect((await comment(task._id, 'One more thing')).status).toBe(201);
    const reopened = await stored(task._id);
    expect(reopened.status).toBe('in-progress');
    expect(reopened.completedAt).toBeFalsy();
  });

  it('adds labels and comments authored by the person who triggered the rule', async () => {
    await create({
      name: 'Label and note', trigger: { type: 'task.priority_changed', to: 'high' }, conditions: [],
      actions: [{ type: 'add_label', value: 'hot' }, { type: 'add_comment', value: 'Raised to high' }],
    });
    const task = await createTask(team.owner, slug, { title: 'Escalate', priority: 'low' });
    await update(task._id, { priority: 'medium' });
    expect((await stored(task._id)).labels).toEqual([]);
    await update(task._id, { priority: 'high' }, team.developer);
    const done = await stored(task._id);
    expect(done.labels).toEqual(['hot']);
    expect(done.comments).toHaveLength(1);
    expect(done.comments[0]).toMatchObject({ text: 'Raised to high', author: { _id: team.developer.id } });
  });

  it('reacts to a label being added and to assignments', async () => {
    await create({
      name: 'Reviewed completes', trigger: { type: 'task.labeled', to: 'reviewed' }, conditions: [], actions: [{ type: 'set_status', value: 'completed' }],
    });
    await create({
      name: 'Assigned starts', trigger: { type: 'task.assigned' }, conditions: [{ field: 'status', op: 'is', value: 'pending' }],
      actions: [{ type: 'set_priority', value: 'high' }],
    });
    const task = await createTask(team.owner, slug, { title: 'Review me', labels: ['reviewed'] });
    // Present at creation: not a "labeled" event
    expect((await stored(task._id)).status).toBe('pending');
    await update(task._id, { labels: ['reviewed', 'extra'] });
    expect((await stored(task._id)).status).toBe('pending');
    await update(task._id, { labels: ['extra'] });
    await update(task._id, { labels: ['extra', 'Reviewed'] });
    expect((await stored(task._id)).status).toBe('completed');

    const second = await createTask(team.owner, slug, { title: 'Hand over' });
    await update(second._id, { assignees: [team.developer.id] });
    expect((await stored(second._id)).priority).toBe('high');
  });

  it('limits a rule to one project', async () => {
    await create(rule({ name: 'Web only', project: 'Web', conditions: [] }));
    const web = await createTask(team.owner, slug, { title: 'In web', project: 'Web', priority: 'low' });
    const elsewhere = await createTask(team.owner, slug, { title: 'Elsewhere', project: 'Mobile', priority: 'low' });
    expect((await stored(web._id)).priority).toBe('high');
    expect((await stored(elsewhere._id)).priority).toBe('low');
  });

  it('does not fire a disabled rule, and fires again once re-enabled', async () => {
    const created = await create(rule({ conditions: [] }));
    await patchRule(created.body._id, { enabled: false });
    const quiet = await createTask(team.owner, slug, { title: 'Quiet', priority: 'low' });
    expect((await stored(quiet._id)).priority).toBe('low');

    await patchRule(created.body._id, { enabled: true });
    const loud = await createTask(team.owner, slug, { title: 'Loud', priority: 'low' });
    expect((await stored(loud._id)).priority).toBe('high');
  });

  it('skips a rule that would change nothing', async () => {
    const created = await create(rule({ conditions: [] }));
    await createTask(team.owner, slug, { title: 'Already high', priority: 'high' });
    expect((await list()).body.find((item: { _id: string }) => item._id === created.body._id).runCount).toBe(0);
  });

  it('chains rules but stops at the depth limit', async () => {
    await create({ name: 'A', trigger: { type: 'task.status_changed', to: 'in-progress' }, conditions: [], actions: [{ type: 'set_priority', value: 'high' }] });
    await create({ name: 'B', trigger: { type: 'task.priority_changed', to: 'high' }, conditions: [], actions: [{ type: 'add_label', value: 'hot' }] });
    await create({ name: 'C', trigger: { type: 'task.labeled', to: 'hot' }, conditions: [], actions: [{ type: 'set_status', value: 'completed' }] });
    await create({ name: 'D', trigger: { type: 'task.status_changed', to: 'completed' }, conditions: [], actions: [{ type: 'add_label', value: 'too-deep' }] });

    const task = await createTask(team.owner, slug, { title: 'Chain', priority: 'low' });
    await update(task._id, { status: 'in-progress' });
    const done = await stored(task._id);
    expect(done.priority).toBe('high');
    expect(done.labels).toEqual(['hot']);
    expect(done.status).toBe('completed');
    expect(done.labels).not.toContain('too-deep');
  });

  it('never fires the same rule twice for a task in one request', async () => {
    const first = await create({ name: 'Finish', trigger: { type: 'task.status_changed', to: 'in-progress' }, conditions: [], actions: [{ type: 'set_status', value: 'completed' }] });
    const second = await create({ name: 'Reopen', trigger: { type: 'task.status_changed', to: 'completed' }, conditions: [], actions: [{ type: 'set_status', value: 'in-progress' }] });
    const task = await createTask(team.owner, slug, { title: 'Ping pong' });
    await update(task._id, { status: 'in-progress' });

    expect((await stored(task._id)).status).toBe('in-progress');
    const rules = (await list()).body as { _id: string; runCount: number }[];
    expect(rules.find(item => item._id === first.body._id)?.runCount).toBe(1);
    expect(rules.find(item => item._id === second.body._id)?.runCount).toBe(1);
  });

  it('moves a task back to the backlog and clears assignees', async () => {
    await create({
      name: 'Reset', trigger: { type: 'task.status_changed', to: 'pending' }, conditions: [],
      actions: [{ type: 'unassign_all' }, { type: 'move_to_backlog' }],
    });
    const task = await createTask(team.owner, slug, { title: 'Reset me', status: 'in-progress', assignees: [team.developer.id] });
    await update(task._id, { status: 'pending' });
    const done = await stored(task._id);
    expect(done.assignees).toEqual([]);
    expect(done.sprint ?? null).toBeNull();
  });
});

describe('automations: workspace isolation', () => {
  beforeEach(clearRules);

  it('keeps rules and runs inside their own workspace', async () => {
    const other = await createWorkspace(outsider, 'Elsewhere');
    await create(rule({ conditions: [] }));

    const foreign = await createTask(outsider, other.slug, { title: 'Foreign', priority: 'low' });
    expect((await stored(foreign._id, other.slug, outsider)).priority).toBe('low');
    expect((await http().get(url('', other.slug)).set(bearer(outsider.token))).body).toEqual([]);
    expect((await http().get(url('', other.slug)).set(bearer(team.owner.token))).status).toBe(403);

    // A rule id from another workspace cannot be edited or removed through this one
    const theirs = await create(rule({ name: 'Theirs' }), outsider, other.slug);
    expect(theirs.status).toBe(201);
    expect((await patchRule(theirs.body._id, { enabled: false })).status).toBe(404);
    expect((await removeRule(theirs.body._id)).status).toBe(404);
  });
});
