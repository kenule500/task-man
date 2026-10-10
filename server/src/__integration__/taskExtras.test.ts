import {
  bearer, createTask, createTeam, http, registerUser, startApp, stopApp, tasksUrl, unknownId,
  type TestUser,
} from './harness.js';

beforeAll(startApp);
afterAll(stopApp);

type Team = Awaited<ReturnType<typeof createTeam>>;
type Row = { _id: string; [key: string]: any };
let team: Team;
let slug: string;
let outsider: TestUser;

beforeAll(async () => {
  team = await createTeam();
  slug = team.workspace.slug;
  outsider = await registerUser('Extras Outsider');
});

const patch = (user: TestUser, id: string, body: Record<string, unknown>) =>
  http().patch(`${tasksUrl(slug)}/${id}`).set(bearer(user.token)).send(body);
const listTasks = async (user: TestUser = team.owner) =>
  (await http().get(tasksUrl(slug)).set(bearer(user.token))).body as Row[];
const taskOf = async (id: string) => (await listTasks()).find(task => task._id === id);
const auditOf = async (id: string) =>
  (await http().get(`${tasksUrl(slug)}/${id}/activity`).set(bearer(team.owner.token))).body.items as
    { action: string; summary: string; changes: { field: string; from?: string; to?: string }[] }[];
const watch = (user: TestUser, id: string) => http().post(`${tasksUrl(slug)}/${id}/watch`).set(bearer(user.token));
const unwatch = (user: TestUser, id: string) => http().delete(`${tasksUrl(slug)}/${id}/watch`).set(bearer(user.token));
const duplicate = (user: TestUser, id: string, body?: Record<string, unknown>) =>
  http().post(`${tasksUrl(slug)}/${id}/duplicate`).set(bearer(user.token)).send(body ?? {});
const comment = (user: TestUser, id: string, text: string) =>
  http().post(`${tasksUrl(slug)}/${id}/comments`).set(bearer(user.token)).send({ text });
const notificationsFor = async (user: TestUser, taskId: string, type?: string) => {
  const res = await http().get('/api/notifications?limit=50').set(bearer(user.token));
  return (res.body.items as { type: string; task: { _id: string } | null }[])
    .filter(item => item.task?._id === taskId && (!type || item.type === type));
};
const dayKey = (value: string) => value.slice(0, 10);

describe('checklist', () => {
  it('is empty by default and can be created with the task, trimming the text', async () => {
    const plain = await createTask(team.owner, slug, { title: 'No list' });
    expect(plain.checklist).toEqual([]);

    const task = await createTask(team.owner, slug, {
      title: 'With list',
      checklist: [{ text: '  Draft  ' }, { text: 'Review', done: true }],
    });
    expect(task.checklist.map((item: Row) => [item.text, item.done])).toEqual([['Draft', false], ['Review', true]]);
    expect(task.checklist.every((item: Row) => typeof item._id === 'string')).toBe(true);
  });

  it('adds, toggles, renames, reorders and deletes items while keeping ids', async () => {
    const task = await createTask(team.owner, slug, { title: 'Edit list' });

    const added = await patch(team.developer, task._id, { checklist: [{ text: 'One' }, { text: 'Two' }, { text: 'Three' }] });
    expect(added.status).toBe(200);
    const [one, two, three] = added.body.checklist as Row[];

    const toggled = await patch(team.developer, task._id, {
      checklist: [{ _id: one._id, text: 'One', done: true }, two, three],
    });
    expect(toggled.body.checklist[0]).toMatchObject({ _id: one._id, done: true });

    const reordered = await patch(team.owner, task._id, {
      checklist: [three, { _id: one._id, text: 'Uno', done: true }, two],
    });
    expect(reordered.body.checklist.map((item: Row) => item._id)).toEqual([three._id, one._id, two._id]);
    expect(reordered.body.checklist[1].text).toBe('Uno');

    const removed = await patch(team.owner, task._id, { checklist: [reordered.body.checklist[1]] });
    expect(removed.body.checklist).toHaveLength(1);
    expect((await patch(team.owner, task._id, { checklist: [] })).body.checklist).toEqual([]);
  });

  it('writes the progress to the activity log', async () => {
    const task = await createTask(team.owner, slug, { title: 'Audited list', checklist: [{ text: 'a' }, { text: 'b' }] });
    await patch(team.owner, task._id, { checklist: [{ ...task.checklist[0], done: true }, task.checklist[1]] });
    const entries = await auditOf(task._id);
    expect(entries[0].changes).toEqual([{ field: 'checklist', from: '0/2', to: '1/2' }]);
  });

  it('validates the items', async () => {
    const task = await createTask(team.owner, slug, { title: 'Validate list' });
    const bad = async (checklist: unknown) => (await patch(team.owner, task._id, { checklist })).status;
    expect(await bad('nope')).toBe(400);
    expect(await bad({ $ne: null })).toBe(400);
    expect(await bad(['text'])).toBe(400);
    expect(await bad([{ text: '' }])).toBe(400);
    expect(await bad([{ text: '   ' }])).toBe(400);
    expect(await bad([{ text: 42 }])).toBe(400);
    expect(await bad([{ done: true }])).toBe(400);
    expect(await bad([{ text: 'x'.repeat(201) }])).toBe(400);
    expect(await bad([{ text: 'ok', done: 'yes' }])).toBe(400);
    expect(await bad([{ text: 'ok', _id: 'not-an-id' }])).toBe(400);
    expect(await bad([{ text: 'ok', _id: { $gt: '' } }])).toBe(400);
    const sameId = unknownId();
    expect(await bad([{ text: 'a', _id: sameId }, { text: 'b', _id: sameId }])).toBe(400);
    expect(await bad(Array.from({ length: 51 }, (_, i) => ({ text: `Item ${i}` })))).toBe(400);
    expect(await bad([{ text: 'x'.repeat(200) }])).toBe(200);
    expect(await bad(Array.from({ length: 50 }, (_, i) => ({ text: `Item ${i}` })))).toBe(200);
  });

  it('needs tasks:write', async () => {
    const task = await createTask(team.owner, slug, { title: 'Locked list' });
    expect((await patch(team.viewer, task._id, { checklist: [{ text: 'sneaky' }] })).status).toBe(403);
    expect((await patch(outsider, task._id, { checklist: [{ text: 'sneaky' }] })).status).toBe(403);
    expect((await taskOf(task._id))?.checklist).toEqual([]);
  });
});

describe('watchers', () => {
  it('adds the creator as a watcher', async () => {
    const task = await createTask(team.developer, slug, { title: 'Mine' });
    expect(task.watchers).toEqual([team.developer.id]);
  });

  it('lets a member watch and unwatch themselves, idempotently', async () => {
    const task = await createTask(team.owner, slug, { title: 'Follow me' });
    const first = await watch(team.developer, task._id);
    expect(first.status).toBe(200);
    expect(first.body.watchers.sort()).toEqual([team.owner.id, team.developer.id].sort());
    expect((await watch(team.developer, task._id)).body.watchers).toHaveLength(2);
    expect((await taskOf(task._id))?.watchers).toHaveLength(2);

    const left = await unwatch(team.developer, task._id);
    expect(left.status).toBe(200);
    expect(left.body.watchers).toEqual([team.owner.id]);
    expect((await unwatch(team.developer, task._id)).body.watchers).toEqual([team.owner.id]);
  });

  it('lets a viewer follow (tasks:read) but not an outsider or an anonymous caller', async () => {
    const task = await createTask(team.owner, slug, { title: 'Read only follow' });
    expect((await watch(team.viewer, task._id)).status).toBe(200);
    expect((await watch(outsider, task._id)).status).toBe(403);
    expect((await unwatch(outsider, task._id)).status).toBe(403);
    expect((await http().post(`${tasksUrl(slug)}/${task._id}/watch`)).status).toBe(401);
  });

  it('answers 404 for unknown or malformed task ids', async () => {
    expect((await watch(team.owner, unknownId())).status).toBe(404);
    expect((await unwatch(team.owner, unknownId())).status).toBe(404);
    expect((await watch(team.owner, 'nope')).status).toBe(404);
  });

  it('makes a commenter a watcher', async () => {
    const task = await createTask(team.owner, slug, { title: 'Chatty' });
    expect((await comment(team.developer, task._id, 'first!')).status).toBe(201);
    expect((await taskOf(task._id))?.watchers.sort()).toEqual([team.owner.id, team.developer.id].sort());
  });

  it('tells watchers about comments, once, and never the commenter', async () => {
    const task = await createTask(team.owner, slug, { title: 'Watched comments' });
    await watch(team.productOwner, task._id);
    await watch(team.viewer, task._id);

    await comment(team.developer, task._id, 'Heads up');
    expect(await notificationsFor(team.productOwner, task._id, 'comment.reply_on_my_task')).toHaveLength(1);
    expect(await notificationsFor(team.viewer, task._id, 'comment.reply_on_my_task')).toHaveLength(1);
    expect(await notificationsFor(team.owner, task._id, 'comment.reply_on_my_task')).toHaveLength(1);
    expect(await notificationsFor(team.developer, task._id)).toHaveLength(0);

    // The commenter now follows the task too, so the next comment reaches them
    await comment(team.owner, task._id, 'Thanks');
    expect(await notificationsFor(team.developer, task._id, 'comment.reply_on_my_task')).toHaveLength(1);
    expect(await notificationsFor(team.owner, task._id, 'comment.reply_on_my_task')).toHaveLength(1);
  });

  it('does not notify someone who stopped watching', async () => {
    const task = await createTask(team.owner, slug, { title: 'Muted' });
    await watch(team.productOwner, task._id);
    await unwatch(team.productOwner, task._id);
    await comment(team.developer, task._id, 'psst');
    expect(await notificationsFor(team.productOwner, task._id)).toHaveLength(0);
  });

  it('tells watchers when the task is completed', async () => {
    const task = await createTask(team.owner, slug, { title: 'Watched completion' });
    await watch(team.productOwner, task._id);
    await patch(team.developer, task._id, { status: 'completed' });
    expect(await notificationsFor(team.productOwner, task._id, 'task.completed')).toHaveLength(1);
    expect(await notificationsFor(team.developer, task._id)).toHaveLength(0);
  });
});

describe('duplicate', () => {
  it('copies the content into a new pending task and drops the rest', async () => {
    const source = await createTask(team.owner, slug, {
      title: 'Original',
      description: 'Details',
      priority: 'high',
      type: 'bug',
      storyPoints: 5,
      project: 'Apollo',
      labels: ['api', 'urgent'],
      startDate: '2030-06-10',
      deadline: '2030-06-20',
      assignees: [team.developer.id],
      checklist: [{ text: 'Step 1', done: true }, { text: 'Step 2' }],
      status: 'in-progress',
    });
    await comment(team.developer, source._id, 'A comment');

    const res = await duplicate(team.productOwner, source._id);
    expect(res.status).toBe(201);
    expect(res.body._id).not.toBe(source._id);
    expect(res.body).toMatchObject({
      title: 'Copy of Original',
      description: 'Details',
      priority: 'high',
      type: 'bug',
      storyPoints: 5,
      project: 'Apollo',
      labels: ['api', 'urgent'],
      status: 'pending',
      comments: [],
      attachments: [],
      dependencies: [],
      subtasks: [],
    });
    expect(dayKey(res.body.startDate)).toBe('2030-06-10');
    expect(dayKey(res.body.deadline)).toBe('2030-06-20');
    expect(res.body.assignees.map((user: Row) => user._id)).toEqual([team.developer.id]);
    expect(res.body.checklist.map((item: Row) => [item.text, item.done])).toEqual([['Step 1', false], ['Step 2', false]]);
    expect(res.body.checklist[0]._id).not.toBe(source.checklist[0]._id);
    expect(res.body.watchers).toEqual([team.productOwner.id]);
    expect(res.body.owner).toBe(team.productOwner.id);
    expect(res.body.number).toBeGreaterThan(source.number);

    expect((await taskOf(res.body._id))?.title).toBe('Copy of Original');
    expect(await taskOf(source._id)).toMatchObject({ title: 'Original', status: 'in-progress' });
    expect((await auditOf(res.body._id))[0]).toMatchObject({ action: 'task.duplicated', summary: 'Copy of Original' });
  });

  it('keeps the title within 140 characters', async () => {
    const source = await createTask(team.owner, slug, { title: 'T'.repeat(140) });
    const res = await duplicate(team.owner, source._id);
    expect(res.status).toBe(201);
    expect(res.body.title).toHaveLength(140);
    expect(res.body.title.startsWith('Copy of ')).toBe(true);
  });

  it('copies the direct subtasks only when asked', async () => {
    const parent = await createTask(team.owner, slug, { title: 'Parent', project: 'Apollo' });
    const sub1 = await createTask(team.owner, slug, { title: 'Sub 1', parent: parent._id, checklist: [{ text: 'x', done: true }] });
    await createTask(team.owner, slug, { title: 'Sub 2', parent: parent._id, status: 'completed' });

    const plain = await duplicate(team.owner, parent._id);
    expect(plain.body.subtasks).toEqual([]);

    const res = await duplicate(team.owner, parent._id, { includeSubtasks: true });
    expect(res.status).toBe(201);
    expect(res.body.subtasks.map((sub: Row) => sub.title)).toEqual(['Sub 1', 'Sub 2']);
    expect(res.body.subtasks.every((sub: Row) => sub.parent === res.body._id && sub.status === 'pending')).toBe(true);
    expect(res.body.subtasks[0].checklist[0]).toMatchObject({ text: 'x', done: false });
    expect(new Set([res.body.number, ...res.body.subtasks.map((sub: Row) => sub.number)]).size).toBe(3);
    const stored = (await listTasks()).filter(task => task.parent === res.body._id);
    expect(stored).toHaveLength(2);
    // The originals keep their children
    expect((await listTasks()).filter(task => task.parent === parent._id)).toHaveLength(2);
    expect(sub1.number).toBeLessThan(res.body.number);
  });

  it('validates the body and the id', async () => {
    const source = await createTask(team.owner, slug, { title: 'Validate copy' });
    expect((await duplicate(team.owner, source._id, { includeSubtasks: 'yes' })).status).toBe(400);
    expect((await duplicate(team.owner, source._id, { includeSubtasks: { $ne: 1 } })).status).toBe(400);
    expect((await duplicate(team.owner, unknownId())).status).toBe(404);
    expect((await duplicate(team.owner, 'nope')).status).toBe(404);
  });

  it('is denied for a viewer, an outsider and anonymous callers, and creates nothing', async () => {
    const source = await createTask(team.owner, slug, { title: 'Protected copy' });
    const before = (await listTasks()).length;
    expect((await duplicate(team.viewer, source._id)).status).toBe(403);
    expect((await duplicate(outsider, source._id)).status).toBe(403);
    expect((await http().post(`${tasksUrl(slug)}/${source._id}/duplicate`)).status).toBe(401);
    expect((await listTasks()).length).toBe(before);
  });
});

describe('recurring tasks', () => {
  const every = (n: number, unit: string, basis = 'due') => ({ every: n, unit, basis });
  const others = async (title: string, excludeId: string) =>
    (await listTasks()).filter(task => task.title === title && task._id !== excludeId);

  it('is off by default and can be set and cleared', async () => {
    const task = await createTask(team.owner, slug, { title: 'Plain' });
    expect(task.recurrence ?? null).toBeNull();
    const set = await patch(team.owner, task._id, { recurrence: every(2, 'week') });
    expect(set.body.recurrence).toEqual(every(2, 'week'));
    expect((await auditOf(task._id))[0].changes).toEqual([
      { field: 'recurrence', to: 'every 2 weeks from due date' },
    ]);
    expect((await patch(team.owner, task._id, { recurrence: null })).body.recurrence).toBeNull();
  });

  it('validates the rule', async () => {
    const task = await createTask(team.owner, slug, { title: 'Validate repeat' });
    const bad = async (recurrence: unknown) => (await patch(team.owner, task._id, { recurrence })).status;
    expect(await bad({ every: 0, unit: 'day', basis: 'due' })).toBe(400);
    expect(await bad({ every: 366, unit: 'day', basis: 'due' })).toBe(400);
    expect(await bad({ every: 1.5, unit: 'day', basis: 'due' })).toBe(400);
    expect(await bad({ every: '2', unit: 'day', basis: 'due' })).toBe(400);
    expect(await bad({ every: 1, unit: 'year', basis: 'due' })).toBe(400);
    expect(await bad({ every: 1, unit: 'day', basis: 'someday' })).toBe(400);
    expect(await bad({ every: 1, unit: 'day' })).toBe(400);
    expect(await bad('daily')).toBe(400);
    expect(await bad({ every: { $gt: 0 }, unit: 'day', basis: 'due' })).toBe(400);
    expect(await bad(every(365, 'month', 'completion'))).toBe(200);
  });

  it('rejects subtasks and epics', async () => {
    const parent = await createTask(team.owner, slug, { title: 'Repeat parent' });
    const sub = await createTask(team.owner, slug, { title: 'Repeat sub', parent: parent._id });
    expect((await patch(team.owner, sub._id, { recurrence: every(1, 'day') })).status).toBe(400);
    const created = await http().post(tasksUrl(slug)).set(bearer(team.owner.token))
      .send({ title: 'Born repeating sub', deadline: '2030-06-15', parent: parent._id, recurrence: every(1, 'day') });
    expect(created.status).toBe(400);

    const repeating = await createTask(team.owner, slug, { title: 'Repeating', recurrence: every(1, 'day') });
    expect((await patch(team.owner, repeating._id, { parent: parent._id })).status).toBe(400);
    expect((await patch(team.owner, repeating._id, { type: 'epic' })).status).toBe(400);
  });

  it('creates the next occurrence from the due date when completed', async () => {
    const source = await createTask(team.owner, slug, {
      title: 'Weekly report',
      description: 'Send it',
      priority: 'high',
      labels: ['ops'],
      assignees: [team.developer.id],
      startDate: '2030-06-10',
      deadline: '2030-06-14',
      checklist: [{ text: 'Collect' }, { text: 'Send' }],
      recurrence: every(1, 'week'),
    });
    await watch(team.productOwner, source._id);
    await patch(team.owner, source._id, { checklist: source.checklist.map((item: Row) => ({ ...item, done: true })) });

    const res = await patch(team.developer, source._id, { status: 'completed' });
    expect(res.status).toBe(200);
    expect(res.body.recurrence).toBeNull();

    const [next] = await others('Weekly report', source._id);
    expect(next).toBeDefined();
    expect(next).toMatchObject({
      status: 'pending', description: 'Send it', priority: 'high', labels: ['ops'], owner: team.owner.id,
      recurrence: every(1, 'week'), comments: [],
    });
    expect(dayKey(next.deadline)).toBe('2030-06-21');
    expect(dayKey(next.startDate)).toBe('2030-06-17');
    expect(next.checklist.map((item: Row) => [item.text, item.done])).toEqual([['Collect', false], ['Send', false]]);
    expect(next.assignees.map((user: Row) => user._id)).toEqual([team.developer.id]);
    expect(next.watchers).toEqual(expect.arrayContaining([team.owner.id, team.productOwner.id, team.developer.id]));
    expect(next.number).toBeGreaterThan(source.number);
    expect((await auditOf(next._id))[0]).toMatchObject({
      action: 'task.created',
      changes: [{ field: 'recurrence', to: 'every week from due date' }],
    });
    expect(await taskOf(source._id)).toMatchObject({ status: 'completed', recurrence: null });
  });

  it('does not repeat again when the completed task is reopened and completed, or saved twice', async () => {
    const source = await createTask(team.owner, slug, { title: 'Once only', deadline: '2030-06-14', recurrence: every(3, 'day') });
    await patch(team.owner, source._id, { status: 'completed' });
    await patch(team.owner, source._id, { status: 'completed', description: 'again' });
    await patch(team.owner, source._id, { status: 'pending' });
    await patch(team.owner, source._id, { status: 'completed' });
    const copies = await others('Once only', source._id);
    expect(copies).toHaveLength(1);
    expect(dayKey(copies[0].deadline)).toBe('2030-06-17');
  });

  it('shifts from the completion day for the completion basis', async () => {
    const source = await createTask(team.owner, slug, {
      title: 'After completion', deadline: '2030-06-14', recurrence: every(2, 'day', 'completion'),
    });
    await patch(team.owner, source._id, { status: 'completed' });
    const [next] = await others('After completion', source._id);
    const expected = new Date();
    expected.setUTCHours(0, 0, 0, 0);
    expected.setUTCDate(expected.getUTCDate() + 2);
    const diff = Math.abs(new Date(next.deadline).getTime() - expected.getTime());
    // Tolerates the test running across UTC midnight
    expect(diff === 0 || diff === 86400000).toBe(true);
  });

  it('uses calendar months clamped to the month end', async () => {
    const jan = await createTask(team.owner, slug, {
      title: 'Month end', startDate: '2031-01-29', deadline: '2031-01-31', recurrence: every(1, 'month'),
    });
    await patch(team.owner, jan._id, { status: 'completed' });
    const [feb] = await others('Month end', jan._id);
    expect(dayKey(feb.deadline)).toBe('2031-02-28');
    expect(dayKey(feb.startDate)).toBe('2031-02-26');

    const leap = await createTask(team.owner, slug, { title: 'Leap end', deadline: '2032-01-31', recurrence: every(1, 'month') });
    await patch(team.owner, leap._id, { status: 'completed' });
    expect(dayKey((await others('Leap end', leap._id))[0].deadline)).toBe('2032-02-29');
  });

  it('creates the next occurrence when a bulk update completes repeating tasks', async () => {
    const a = await createTask(team.owner, slug, { title: 'Bulk repeat A', deadline: '2030-07-01', recurrence: every(1, 'week') });
    const b = await createTask(team.owner, slug, { title: 'Bulk repeat B', deadline: '2030-07-02', recurrence: every(1, 'day') });
    const plain = await createTask(team.owner, slug, { title: 'Bulk plain', deadline: '2030-07-03' });

    const res = await http().patch(`${tasksUrl(slug)}/bulk`).set(bearer(team.developer.token))
      .send({ ids: [a._id, b._id, plain._id], patch: { status: 'completed' } });
    expect(res.status).toBe(200);
    expect(res.body.tasks.find((task: Row) => task._id === a._id).recurrence).toBeNull();

    expect(dayKey((await others('Bulk repeat A', a._id))[0].deadline)).toBe('2030-07-08');
    expect(dayKey((await others('Bulk repeat B', b._id))[0].deadline)).toBe('2030-07-03');
    expect(await others('Bulk plain', plain._id)).toHaveLength(0);

    // A bulk change that does not complete anything repeats nothing
    const c = await createTask(team.owner, slug, { title: 'Bulk repeat C', recurrence: every(1, 'day') });
    await http().patch(`${tasksUrl(slug)}/bulk`).set(bearer(team.owner.token)).send({ ids: [c._id], patch: { priority: 'low' } });
    expect(await others('Bulk repeat C', c._id)).toHaveLength(0);
  });
});
