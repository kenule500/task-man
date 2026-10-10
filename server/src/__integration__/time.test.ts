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
let outsider: TestUser;

beforeAll(async () => {
  team = await createTeam();
  slug = team.workspace.slug;
  outsider = await registerUser('Time Outsider');
});

const timeUrl = (id: string) => `${tasksUrl(slug)}/${id}/time`;
const logTime = (user: TestUser, id: string, body: Record<string, unknown>) =>
  http().post(timeUrl(id)).set(bearer(user.token)).send(body);
const startTimer = (user: TestUser, id: string) =>
  http().post(`${tasksUrl(slug)}/${id}/timer/start`).set(bearer(user.token));
const stopTimer = (user: TestUser, id: string) =>
  http().post(`${tasksUrl(slug)}/${id}/timer/stop`).set(bearer(user.token));
const taskTime = (user: TestUser, id: string) => http().get(timeUrl(id)).set(bearer(user.token));
const sheet = (user: TestUser, query = '') =>
  http().get(`/api/workspaces/${slug}/time${query}`).set(bearer(user.token));
const running = async (user: TestUser) =>
  (await http().get(`/api/workspaces/${slug}/time/running`).set(bearer(user.token))).body.entry as Row | null;
const loggedOf = async (id: string) =>
  ((await http().get(tasksUrl(slug)).set(bearer(team.owner.token))).body as Row[]).find(task => task._id === id)?.loggedMinutes;
const isoDaysAgo = (days: number, hour = 9) => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  date.setUTCHours(hour, 0, 0, 0);
  return date.toISOString();
};

describe('estimate', () => {
  it('is set through the task endpoints and starts empty', async () => {
    const plain = await createTask(team.owner, slug, { title: 'No estimate' });
    expect(plain.estimateMinutes).toBeNull();
    expect(plain.loggedMinutes).toBe(0);

    const estimated = await createTask(team.owner, slug, { title: 'Estimated', estimateMinutes: 150 });
    expect(estimated.estimateMinutes).toBe(150);

    const changed = await http().patch(`${tasksUrl(slug)}/${estimated._id}`).set(bearer(team.developer.token)).send({ estimateMinutes: 90 });
    expect(changed.body.estimateMinutes).toBe(90);
    const cleared = await http().patch(`${tasksUrl(slug)}/${estimated._id}`).set(bearer(team.developer.token)).send({ estimateMinutes: null });
    expect(cleared.body.estimateMinutes).toBeNull();
  });

  it('rejects negative, fractional and huge estimates', async () => {
    const task = await createTask(team.owner, slug, { title: 'Bad estimate' });
    for (const estimateMinutes of [-1, 1.5, 100001, 'long']) {
      const res = await http().patch(`${tasksUrl(slug)}/${task._id}`).set(bearer(team.owner.token)).send({ estimateMinutes });
      expect(res.status).toBe(400);
    }
  });
});

describe('manual entries', () => {
  it('logs minutes, keeps loggedMinutes in sync and lists the entry with its author', async () => {
    const task = await createTask(team.owner, slug, { title: 'Manual' });
    const first = await logTime(team.developer, task._id, { minutes: 90, note: 'Pairing' });
    expect(first.status).toBe(201);
    expect(first.body.entry).toMatchObject({ minutes: 90, note: 'Pairing', running: false });
    expect(first.body.loggedMinutes).toBe(90);
    await logTime(team.owner, task._id, { minutes: 30 });
    expect(await loggedOf(task._id)).toBe(120);

    const listed = await taskTime(team.viewer, task._id);
    expect(listed.status).toBe(200);
    expect(listed.body.loggedMinutes).toBe(120);
    expect(listed.body.entries).toHaveLength(2);
    expect(listed.body.entries.map((entry: Row) => entry.user.name).sort()).toEqual(['Dan Developer', 'Olivia Owner']);
  });

  it('accepts a start and an end time and a start date with minutes', async () => {
    const task = await createTask(team.owner, slug, { title: 'Ranged' });
    const range = await logTime(team.owner, task._id, { startedAt: isoDaysAgo(3, 9), endedAt: isoDaysAgo(3, 10).replace(':00:00', ':15:00') });
    expect(range.status).toBe(201);
    expect(range.body.entry.minutes).toBe(75);

    const dated = await logTime(team.owner, task._id, { minutes: 20, startedAt: isoDaysAgo(2) });
    expect(dated.status).toBe(201);
    expect(dated.body.entry.startedAt).toBe(isoDaysAgo(2));
    expect(dated.body.loggedMinutes).toBe(95);
  });

  it('rejects bad input', async () => {
    const task = await createTask(team.owner, slug, { title: 'Invalid time' });
    const bad: Record<string, unknown>[] = [
      {},
      { minutes: 0 },
      { minutes: 1441 },
      { minutes: 1.5 },
      { minutes: 10, note: 'x'.repeat(201) },
      { startedAt: '2030-01-01T10:00:00.000Z', endedAt: '2030-01-01T09:00:00.000Z' },
      { startedAt: '2030-01-01T00:00:00.000Z', endedAt: '2030-01-03T00:00:00.000Z' },
      { startedAt: 'yesterday', endedAt: 'today' },
      { minutes: 10, startedAt: new Date(Date.now() + 5 * 86_400_000).toISOString() },
    ];
    for (const body of bad) {
      expect([body, (await logTime(team.owner, task._id, body)).status]).toEqual([body, 400]);
    }
    expect(await loggedOf(task._id)).toBe(0);
  });

  it('answers 404 for an unknown or malformed task', async () => {
    expect((await logTime(team.owner, unknownId(), { minutes: 5 })).status).toBe(404);
    expect((await logTime(team.owner, 'nope', { minutes: 5 })).status).toBe(404);
    expect((await taskTime(team.owner, unknownId())).status).toBe(404);
  });
});

describe('timer', () => {
  it('starts, reports and stops a timer, logging at least a minute', async () => {
    const task = await createTask(team.developer, slug, { title: 'Timed' });
    const started = await startTimer(team.developer, task._id);
    expect(started.status).toBe(201);
    expect(started.body.entry).toMatchObject({ running: true, endedAt: null, minutes: 0 });
    expect(started.body.stopped).toBeNull();

    const live = await running(team.developer);
    expect(live).toMatchObject({ _id: started.body.entry._id, task: { _id: task._id, title: 'Timed' } });
    expect(live?.task.key).toMatch(/^[A-Z0-9]+-\d+$/);
    expect(await running(team.owner)).toBeNull();
    expect((await taskTime(team.developer, task._id)).body.running._id).toBe(started.body.entry._id);
    expect(await loggedOf(task._id)).toBe(0);

    const stopped = await stopTimer(team.developer, task._id);
    expect(stopped.status).toBe(200);
    expect(stopped.body.entry).toMatchObject({ running: false });
    expect(stopped.body.entry.minutes).toBeGreaterThanOrEqual(1);
    expect(stopped.body.entry.endedAt).toEqual(expect.any(String));
    expect(await loggedOf(task._id)).toBe(stopped.body.entry.minutes);
    expect(await running(team.developer)).toBeNull();
  });

  it('is idempotent on the same task and answers 404 when nothing runs', async () => {
    const task = await createTask(team.owner, slug, { title: 'Twice' });
    const first = await startTimer(team.owner, task._id);
    const second = await startTimer(team.owner, task._id);
    expect(second.status).toBe(200);
    expect(second.body.entry._id).toBe(first.body.entry._id);
    expect((await stopTimer(team.owner, task._id)).status).toBe(200);
    expect((await stopTimer(team.owner, task._id)).status).toBe(404);
  });

  it('stops the running timer when another task is started', async () => {
    const one = await createTask(team.owner, slug, { title: 'Switch one' });
    const two = await createTask(team.owner, slug, { title: 'Switch two' });
    await startTimer(team.owner, one._id);
    const switched = await startTimer(team.owner, two._id);
    expect(switched.status).toBe(201);
    expect(switched.body.stopped).toMatchObject({ task: one._id, running: false });
    expect(switched.body.stopped.minutes).toBeGreaterThanOrEqual(1);
    expect((await running(team.owner))?.task._id).toBe(two._id);
    expect(await loggedOf(one._id)).toBe(switched.body.stopped.minutes);
    expect((await stopTimer(team.owner, one._id)).status).toBe(404);
    await stopTimer(team.owner, two._id);
  });

  it('gives every user their own timer', async () => {
    const task = await createTask(team.owner, slug, { title: 'Shared timer' });
    await startTimer(team.owner, task._id);
    await startTimer(team.developer, task._id);
    expect(await running(team.owner)).not.toBeNull();
    expect(await running(team.developer)).not.toBeNull();
    await stopTimer(team.owner, task._id);
    expect(await running(team.developer)).not.toBeNull();
    await stopTimer(team.developer, task._id);
  });
});

describe('permissions and isolation', () => {
  it('lets a viewer read but not log or run timers', async () => {
    const task = await createTask(team.owner, slug, { title: 'Read only' });
    expect((await taskTime(team.viewer, task._id)).status).toBe(200);
    expect((await logTime(team.viewer, task._id, { minutes: 5 })).status).toBe(403);
    expect((await startTimer(team.viewer, task._id)).status).toBe(403);
    expect((await stopTimer(team.viewer, task._id)).status).toBe(403);
    expect((await sheet(team.viewer)).status).toBe(200);
  });

  it('blocks outsiders and anonymous callers', async () => {
    const task = await createTask(team.owner, slug, { title: 'Private time' });
    expect((await taskTime(outsider, task._id)).status).toBe(403);
    expect((await logTime(outsider, task._id, { minutes: 5 })).status).toBe(403);
    expect((await sheet(outsider)).status).toBe(403);
    expect((await http().get(timeUrl(task._id))).status).toBe(401);
    expect((await http().get(`/api/workspaces/${slug}/time`)).status).toBe(401);
  });

  it('does not reach tasks or entries of another workspace', async () => {
    const otherWorkspace = await createWorkspace(outsider, 'Time other');
    const foreign = await createTask(outsider, otherWorkspace.slug, { title: 'Foreign' });
    expect((await logTime(team.owner, foreign._id, { minutes: 5 })).status).toBe(404);
    expect((await startTimer(team.owner, foreign._id)).status).toBe(404);

    const mine = await createTask(team.owner, slug, { title: 'Mine' });
    const entry = (await logTime(team.owner, mine._id, { minutes: 5 })).body.entry as Row;
    const crossed = await http()
      .delete(`/api/workspaces/${otherWorkspace.slug}/tasks/${mine._id}/time/${entry._id}`)
      .set(bearer(outsider.token));
    expect(crossed.status).toBe(404);
    expect(await loggedOf(mine._id)).toBe(5);
  });

  it('lets people delete their own entries and managers delete anyone\'s', async () => {
    const task = await createTask(team.owner, slug, { title: 'Delete time' });
    const devEntry = (await logTime(team.developer, task._id, { minutes: 40 })).body.entry as Row;
    const ownerEntry = (await logTime(team.owner, task._id, { minutes: 20 })).body.entry as Row;
    const remove = (user: TestUser, entry: Row) =>
      http().delete(`${timeUrl(task._id)}/${entry._id}`).set(bearer(user.token));

    expect((await remove(team.developer, ownerEntry)).status).toBe(403);
    expect((await remove(team.viewer, devEntry)).status).toBe(403);
    expect(await loggedOf(task._id)).toBe(60);

    const own = await remove(team.developer, devEntry);
    expect(own.status).toBe(200);
    expect(own.body.loggedMinutes).toBe(20);
    expect((await remove(team.developer, devEntry)).status).toBe(404);

    const devAgain = (await logTime(team.developer, task._id, { minutes: 15 })).body.entry as Row;
    expect((await remove(team.productOwner, devAgain)).status).toBe(200);
    expect(await loggedOf(task._id)).toBe(20);
  });

  it('removes the entries and a running timer with the task', async () => {
    const task = await createTask(team.owner, slug, { title: 'Doomed' });
    await logTime(team.owner, task._id, { minutes: 10 });
    await startTimer(team.owner, task._id);
    expect((await http().delete(`${tasksUrl(slug)}/${task._id}`).set(bearer(team.owner.token))).status).toBe(200);
    expect(await running(team.owner)).toBeNull();
    const rows = (await sheet(team.owner)).body.entries as Row[];
    expect(rows.some(row => row.task._id === task._id)).toBe(false);
  });
});

describe('timesheet', () => {
  let alpha: Row;
  let beta: Row;
  const inRange = `from=${encodeURIComponent(isoDaysAgo(40, 0))}&to=${encodeURIComponent(isoDaysAgo(30, 0))}`;

  beforeAll(async () => {
    alpha = await createTask(team.owner, slug, { title: 'Sheet alpha', project: 'Sheet Alpha' });
    beta = await createTask(team.owner, slug, { title: 'Sheet beta', project: 'Sheet Beta' });
    await logTime(team.developer, alpha._id, { minutes: 60, startedAt: isoDaysAgo(35, 9) });
    await logTime(team.developer, alpha._id, { minutes: 30, startedAt: isoDaysAgo(34, 9) });
    await logTime(team.owner, beta._id, { minutes: 45, startedAt: isoDaysAgo(35, 10) });
    await logTime(team.owner, beta._id, { minutes: 5, startedAt: isoDaysAgo(20, 10) });
  });

  it('lets a manager see everyone with totals per user, day and task', async () => {
    const res = await sheet(team.owner, `?${inRange}`);
    expect(res.status).toBe(200);
    expect(res.body.entries).toHaveLength(3);
    expect(res.body.totals.minutes).toBe(135);
    expect(res.body.totals.byUser).toEqual([
      expect.objectContaining({ name: 'Dan Developer', minutes: 90 }),
      expect.objectContaining({ name: 'Olivia Owner', minutes: 45 }),
    ]);
    expect(res.body.totals.byDay).toEqual([
      { day: isoDaysAgo(35).slice(0, 10), minutes: 105 },
      { day: isoDaysAgo(34).slice(0, 10), minutes: 30 },
    ].sort((a, b) => a.day.localeCompare(b.day)));
    expect(res.body.totals.byTask).toEqual([
      expect.objectContaining({ task: alpha._id, title: 'Sheet alpha', minutes: 90 }),
      expect.objectContaining({ task: beta._id, title: 'Sheet beta', minutes: 45 }),
    ]);
    expect(res.body.entries[0].task).toMatchObject({ title: expect.any(String), key: expect.stringMatching(/-\d+$/) });
    expect(res.body.truncated).toBe(false);
  });

  it('shows everyone else only their own time, whatever the user filter says', async () => {
    const res = await sheet(team.developer, `?${inRange}&user=${team.owner.id}`);
    expect(res.status).toBe(200);
    expect(res.body.totals.minutes).toBe(90);
    expect(res.body.entries.every((entry: Row) => entry.user._id === team.developer.id)).toBe(true);
    expect((await sheet(team.viewer, `?${inRange}`)).body.entries).toEqual([]);
  });

  it('filters by user, project and date for managers', async () => {
    const byUser = await sheet(team.owner, `?${inRange}&user=${team.owner.id}`);
    expect(byUser.body.totals.minutes).toBe(45);
    const byProject = await sheet(team.owner, `?${inRange}&project=${encodeURIComponent('Sheet Alpha')}`);
    expect(byProject.body.totals.minutes).toBe(90);
    const byDay = await sheet(team.owner, `?from=${isoDaysAgo(34).slice(0, 10)}&to=${isoDaysAgo(34).slice(0, 10)}`);
    expect(byDay.body.totals.minutes).toBe(30);
    expect((await sheet(team.owner, `?${inRange}&project=Nothing`)).body.entries).toEqual([]);
  });

  it('rejects malformed filters, including operator injection', async () => {
    expect((await sheet(team.owner, '?from=soon')).status).toBe(400);
        expect((await sheet(team.owner, '?user=nope')).status).toBe(400);
    // Operator objects are either dropped by the sanitiser or refused; they never widen or break the query
    for (const query of ['?to[$gt]=', '?user[$ne]=x', '?project[$ne]=x']) {
      expect([query, [200, 400].includes((await sheet(team.owner, query)).status)]).toEqual([query, true]);
    }
  });

  it('keeps entries of other workspaces out', async () => {
    const otherWorkspace = await createWorkspace(outsider, 'Time sheet other');
    const foreign = await createTask(outsider, otherWorkspace.slug, { title: 'Foreign sheet' });
    await http().post(`/api/workspaces/${otherWorkspace.slug}/tasks/${foreign._id}/time`).set(bearer(outsider.token)).send({ minutes: 999 });
    const res = await sheet(team.owner);
    expect(res.body.entries.some((entry: Row) => entry.task._id === foreign._id)).toBe(false);
  });

  it('exports CSV with formulas neutralised', async () => {
    const task = await createTask(team.owner, slug, { title: '=HYPERLINK("http://evil")', project: 'Csv' });
    await logTime(team.owner, task._id, { minutes: 90, note: '+cmd|calc, "quoted"', startedAt: isoDaysAgo(50, 9) });
    const csv = await http()
      .get(`/api/workspaces/${slug}/time/export.csv?from=${isoDaysAgo(50).slice(0, 10)}&to=${isoDaysAgo(50).slice(0, 10)}`)
      .set(bearer(team.owner.token));
    expect(csv.status).toBe(200);
    expect(csv.headers['content-type']).toMatch(/text\/csv/);
    expect(csv.headers['content-disposition']).toMatch(/attachment; filename="timesheet-/);
    const lines = csv.text.replace(/^﻿/, '').trim().split('\r\n');
    expect(lines[0]).toBe('"Date","User","Task key","Task","Project","Started","Ended","Minutes","Hours","Note"');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('"\'=HYPERLINK(""http://evil"")"');
    expect(lines[1]).toContain('"\'+cmd|calc, ""quoted"""');
    expect(lines[1]).toContain('"90","1.50"');
  });

  it('limits the CSV to the caller\'s own time unless they manage the workspace', async () => {
    const csv = await http().get(`/api/workspaces/${slug}/time/export.csv?${inRange}`).set(bearer(team.developer.token));
    expect(csv.status).toBe(200);
    expect(csv.text).toContain('Dan Developer');
    expect(csv.text).not.toContain('Olivia Owner');
    expect((await http().get(`/api/workspaces/${slug}/time/export.csv`).set(bearer(outsider.token))).status).toBe(403);
  });
});
