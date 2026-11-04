import {
  bearer, createTask, createTeam, emailsTo, http, registerUser, startApp, stopApp, tasksUrl, unknownId,
  type TestUser,
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

interface Item {
  _id: string;
  type: string;
  summary: string;
  readAt: string | null;
  actor: { _id: string; name: string } | null;
  task: { _id: string; title: string; number: number | null; key: string } | null;
  workspace: { slug: string } | null;
}

const list = (user: TestUser, query = '') => http().get(`/api/notifications${query}`).set(bearer(user.token));
const itemsFor = async (user: TestUser, query = ''): Promise<Item[]> => (await list(user, query)).body.items;
const forTask = async (user: TestUser, taskId: string, type?: string) =>
  (await itemsFor(user, '?limit=50')).filter(item => item.task?._id === taskId && (!type || item.type === type));
const mailsAbout = (user: TestUser, title: string) => emailsTo(user.email).filter(mail => mail.subject.includes(title));
const setPrefs = (user: TestUser, prefs: Record<string, boolean>) =>
  http().put('/api/profile/notifications').set(bearer(user.token)).send(prefs);
const patchTask = (user: TestUser, id: string, body: Record<string, unknown>) =>
  http().patch(`${tasksUrl(slug)}/${id}`).set(bearer(user.token)).send(body);
const comment = (user: TestUser, id: string, text: string) =>
  http().post(`${tasksUrl(slug)}/${id}/comments`).set(bearer(user.token)).send({ text });

describe('notifications: access', () => {
  it('requires a session', async () => {
    expect((await http().get('/api/notifications')).status).toBe(401);
    expect((await http().post('/api/notifications/read-all')).status).toBe(401);
    expect((await http().post(`/api/notifications/${unknownId()}/read`)).status).toBe(401);
  });

  it('starts empty for a new user', async () => {
    const res = await list(outsider);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ items: [], nextBefore: null, unreadCount: 0 });
  });

  it('rejects a malformed cursor', async () => {
    expect((await list(team.owner, '?before=nonsense')).status).toBe(400);
  });
});

describe('notifications: task assignment', () => {
  it('notifies new assignees (not the actor) and emails them when their flags are on', async () => {
    const task = await createTask(team.owner, slug, {
      title: 'Assign me please', assignees: [team.developer.id, team.owner.id],
    });

    const [dev] = await forTask(team.developer, task._id, 'task.assigned');
    expect(dev).toMatchObject({
      type: 'task.assigned',
      summary: 'Assign me please',
      readAt: null,
      actor: { _id: team.owner.id, name: 'Olivia Owner' },
      task: { _id: task._id, title: 'Assign me please' },
      workspace: { slug },
    });
    expect(dev.task?.key).toMatch(/^[A-Z0-9]{2,6}-\d+$/);
    expect(await forTask(team.owner, task._id)).toEqual([]);

    const mails = mailsAbout(team.developer, 'Assign me please');
    expect(mails).toHaveLength(1);
    expect(mails[0].text).toContain(`http://localhost:5173/${slug}/tasks?task=${task._id}`);
    expect(mails[0].text).toContain('Olivia Owner assigned you');
    expect(mailsAbout(team.owner, 'Assign me please')).toHaveLength(0);
  });

  it('keeps the in-app notification but sends no email when the email flags are off', async () => {
    expect((await setPrefs(team.productOwner, { email: false })).status).toBe(200);
    const task = await createTask(team.owner, slug, { title: 'No mail for Pat', assignees: [team.productOwner.id] });
    expect(await forTask(team.productOwner, task._id, 'task.assigned')).toHaveLength(1);
    expect(mailsAbout(team.productOwner, 'No mail for Pat')).toHaveLength(0);

    expect((await setPrefs(team.productOwner, { email: true, taskAssigned: false })).status).toBe(200);
    const second = await createTask(team.owner, slug, { title: 'Flag off for Pat', assignees: [team.productOwner.id] });
    expect(await forTask(team.productOwner, second._id, 'task.assigned')).toHaveLength(1);
    expect(mailsAbout(team.productOwner, 'Flag off for Pat')).toHaveLength(0);
    await setPrefs(team.productOwner, { email: true, taskAssigned: true });
  });

  it('notifies only assignees added by an update', async () => {
    const task = await createTask(team.owner, slug, { title: 'Grow the team', assignees: [team.developer.id] });
    expect((await patchTask(team.owner, task._id, { assignees: [team.developer.id, team.productOwner.id] })).status).toBe(200);
    expect(await forTask(team.developer, task._id, 'task.assigned')).toHaveLength(1);
    expect(await forTask(team.productOwner, task._id, 'task.assigned')).toHaveLength(1);

    expect((await patchTask(team.owner, task._id, { title: 'Grow the team (renamed)' })).status).toBe(200);
    expect(await forTask(team.developer, task._id, 'task.assigned')).toHaveLength(1);
  });

  it('does not notify someone who assigns themselves', async () => {
    const task = await createTask(team.developer, slug, { title: 'Mine already', assignees: [team.developer.id] });
    expect(await forTask(team.developer, task._id)).toEqual([]);
  });
});

describe('notifications: completion', () => {
  it('tells the owner and assignees except the actor, and emails only completion subscribers', async () => {
    const task = await createTask(team.owner, slug, {
      title: 'Finish line', assignees: [team.developer.id, team.productOwner.id],
    });
    await setPrefs(team.owner, { taskCompleted: true });

    expect((await patchTask(team.developer, task._id, { status: 'completed' })).status).toBe(200);
    expect(await forTask(team.owner, task._id, 'task.completed')).toHaveLength(1);
    expect(await forTask(team.productOwner, task._id, 'task.completed')).toHaveLength(1);
    expect(await forTask(team.developer, task._id, 'task.completed')).toEqual([]);

    // Owner opted in, Pat did not (taskCompleted defaults to off)
    expect(mailsAbout(team.owner, 'Finish line').filter(mail => mail.subject.startsWith('Completed'))).toHaveLength(1);
    expect(mailsAbout(team.productOwner, 'Finish line').filter(mail => mail.subject.startsWith('Completed'))).toHaveLength(0);

    // Saving a completed task again does not repeat it
    expect((await patchTask(team.developer, task._id, { priority: 'high' })).status).toBe(200);
    expect(await forTask(team.owner, task._id, 'task.completed')).toHaveLength(1);
  });
});

describe('notifications: comments and mentions', () => {
  let taskId: string;

  beforeAll(async () => {
    taskId = (await createTask(team.owner, slug, { title: 'Talk about it', assignees: [team.developer.id] }))._id;
  });

  it('stores resolved mentions and notifies mentioned members, then the task people', async () => {
    const res = await comment(team.productOwner, taskId, 'Hey @Dan Developer and @olivia, thoughts? Email me at pat@example.com');
    expect(res.status).toBe(201);
    expect(res.body.mentions.sort()).toEqual([team.developer.id, team.owner.id].sort());

    expect(await forTask(team.developer, taskId, 'comment.mention')).toHaveLength(1);
    expect(await forTask(team.owner, taskId, 'comment.mention')).toHaveLength(1);
    // Mentioned people do not also get the "comment on my task" notification
    expect(await forTask(team.developer, taskId, 'comment.reply_on_my_task')).toEqual([]);
    expect(await forTask(team.productOwner, taskId)).toEqual([]);

    const mail = mailsAbout(team.developer, 'Talk about it').find(m => m.subject.includes('mentioned you'));
    expect(mail?.text).toContain('@Dan Developer');
    expect(mail?.text).toContain(`/${slug}/tasks?task=${taskId}`);
  });

  it('notifies the owner and assignees about an unmentioned comment', async () => {
    const res = await comment(team.productOwner, taskId, 'Just a plain update');
    expect(res.body.mentions).toEqual([]);
    expect(await forTask(team.developer, taskId, 'comment.reply_on_my_task')).toHaveLength(1);
    expect(await forTask(team.owner, taskId, 'comment.reply_on_my_task')).toHaveLength(1);
  });

  it('never notifies the author, even when they mention themselves', async () => {
    const task = await createTask(team.owner, slug, { title: 'Solo thread' });
    const res = await comment(team.owner, task._id, 'note to self @Olivia Owner');
    expect(res.status).toBe(201);
    expect(res.body.mentions).toEqual([]);
    expect(await forTask(team.owner, task._id)).toEqual([]);
  });

  it('ignores names that are not members of the workspace', async () => {
    const res = await comment(team.owner, taskId, `cc @${outsider.name} and @Nobody`);
    expect(res.status).toBe(201);
    expect(res.body.mentions).toEqual([]);
    expect(await itemsFor(outsider)).toEqual([]);
  });
});

describe('notifications: reading and isolation', () => {
  let recipient: TestUser;
  let ids: string[];

  beforeAll(async () => {
    recipient = team.developer;
    for (const title of ['Read A', 'Read B', 'Read C']) {
      await createTask(team.owner, slug, { title, assignees: [recipient.id] });
    }
    ids = (await itemsFor(recipient, '?limit=50')).map(item => item._id);
  });

  it('pages with a cursor, newest first, and reports the unread total', async () => {
    const first = await list(recipient, '?limit=2');
    expect(first.status).toBe(200);
    expect(first.body.items).toHaveLength(2);
    expect(first.body.items[0].summary).toBe('Read C');
    expect(first.body.nextBefore).toEqual(expect.any(String));
    expect(first.body.unreadCount).toBe(ids.length);

    const second = await list(recipient, `?limit=2&before=${encodeURIComponent(first.body.nextBefore)}`);
    expect(second.body.items[0]._id).not.toBe(first.body.items[1]._id);
    const seen = [...first.body.items, ...second.body.items].map((item: Item) => item._id);
    expect(new Set(seen).size).toBe(seen.length);
  });

  it('marks one notification as read and filters with unread=1', async () => {
    const target = ids[0];
    const before = (await list(recipient)).body.unreadCount;
    const res = await http().post(`/api/notifications/${target}/read`).set(bearer(recipient.token));
    expect(res.status).toBe(200);
    expect(res.body.unreadCount).toBe(before - 1);

    // Idempotent
    expect((await http().post(`/api/notifications/${target}/read`).set(bearer(recipient.token))).body.unreadCount).toBe(before - 1);

    const unread = await itemsFor(recipient, '?unread=1&limit=50');
    expect(unread.map(item => item._id)).not.toContain(target);
    expect(unread.every(item => item.readAt === null)).toBe(true);
    const all = await itemsFor(recipient, '?limit=50');
    expect(all.find(item => item._id === target)?.readAt).toEqual(expect.any(String));
  });

  it('answers 404 for unknown ids and for another user\'s notifications, leaving them unread', async () => {
    expect((await http().post(`/api/notifications/${unknownId()}/read`).set(bearer(recipient.token))).status).toBe(404);
    expect((await http().post('/api/notifications/not-an-id/read').set(bearer(recipient.token))).status).toBe(404);

    const foreign = ids[1];
    const attempt = await http().post(`/api/notifications/${foreign}/read`).set(bearer(team.owner.token));
    expect(attempt.status).toBe(404);
    expect((await itemsFor(recipient, '?limit=50')).find(item => item._id === foreign)?.readAt).toBeNull();
    expect((await itemsFor(team.owner, '?limit=50')).map(item => item._id)).not.toContain(foreign);
  });

  it('marks all of the caller\'s notifications as read without touching other users', async () => {
    const ownerBefore = (await list(team.owner)).body.unreadCount;
    expect(ownerBefore).toBeGreaterThan(0);

    const res = await http().post('/api/notifications/read-all').set(bearer(recipient.token));
    expect(res.status).toBe(200);
    expect(res.body.unreadCount).toBe(0);
    expect((await list(recipient)).body.unreadCount).toBe(0);
    expect(await itemsFor(recipient, '?unread=1')).toEqual([]);
    expect((await list(team.owner)).body.unreadCount).toBe(ownerBefore);
  });

  it('hides notifications of workspaces the user has left', async () => {
    const leaver = team.viewer;
    // Viewer cannot be assigned through the API as a stranger would: make a fresh assignment first
    const task = await createTask(team.owner, slug, { title: 'Before leaving', assignees: [leaver.id] });
    expect(await forTask(leaver, task._id, 'task.assigned')).toHaveLength(1);

    const left = await http().delete(`/api/workspaces/${slug}/members/me`).set(bearer(leaver.token));
    expect(left.status).toBe(200);
    const after = await list(leaver);
    expect(after.body.items).toEqual([]);
    expect(after.body.unreadCount).toBe(0);
  });
});
