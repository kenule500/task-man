import {
  bearer, createTask, createTeam, http, startApp, stopApp, tasksUrl, unknownId, type TestUser,
} from './harness.js';

beforeAll(startApp);
afterAll(stopApp);

type Team = Awaited<ReturnType<typeof createTeam>>;
let team: Team;
let slug: string;

beforeAll(async () => {
  team = await createTeam();
  slug = team.workspace.slug;
});

const get = (url: string, user: TestUser = team.owner) => http().get(url).set(bearer(user.token));
const patch = (id: string, body: object) =>
  http().patch(`${tasksUrl(slug)}/${id}`).set(bearer(team.owner.token)).send(body);
const auditUrl = () => `/api/workspaces/${slug}/activity`;

describe('task numbers (keys)', () => {
  it('numbers tasks sequentially per workspace and finds them by key', async () => {
    const first = await createTask(team.owner, slug, { title: 'Numbered one' });
    const second = await createTask(team.owner, slug, { title: 'Numbered two' });
    expect(typeof first.number).toBe('number');
    expect(second.number).toBe(first.number + 1);

    for (const search of [`WEB-${second.number}`, `#${second.number}`, String(second.number)]) {
      const res = await get(`${tasksUrl(slug)}?search=${encodeURIComponent(search)}`);
      expect(res.body.map((task: { _id: string }) => task._id)).toContain(second._id);
    }
  });
});

describe('task activity', () => {
  it('records creation, field changes, comments and deletion with the actor', async () => {
    const task = await createTask(team.owner, slug, { title: 'Audited task', priority: 'low' });
    await patch(task._id, { status: 'in-progress', priority: 'high', description: 'secret details' });
    await http().post(`${tasksUrl(slug)}/${task._id}/comments`).set(bearer(team.owner.token)).send({ text: 'Looks good' });

    const res = await get(`${tasksUrl(slug)}/${task._id}/activity`);
    expect(res.status).toBe(200);
    const actions = res.body.items.map((item: { action: string }) => item.action);
    expect(actions).toEqual(['task.commented', 'task.updated', 'task.created']);

    const update = res.body.items[1];
    expect(update.actor).toMatchObject({ name: team.owner.name });
    expect(update.actor.email).toBeUndefined();
    expect(update.changes).toEqual(expect.arrayContaining([
      { field: 'status', from: 'pending', to: 'in-progress' },
      { field: 'priority', from: 'low', to: 'high' },
      { field: 'description' },
    ]));
    // Description text is never copied into the log
    expect(JSON.stringify(res.body)).not.toContain('secret details');
  });

  it('paginates with a before cursor and hides other workspaces', async () => {
    const task = await createTask(team.owner, slug, { title: 'Paged' });
    for (const status of ['in-progress', 'completed', 'pending']) await patch(task._id, { status });

    const firstPage = await get(`${tasksUrl(slug)}/${task._id}/activity?limit=2`);
    expect(firstPage.body.items).toHaveLength(2);
    expect(firstPage.body.nextBefore).toEqual(expect.any(String));
    const next = await get(`${tasksUrl(slug)}/${task._id}/activity?limit=2&before=${encodeURIComponent(firstPage.body.nextBefore)}`);
    expect(next.body.items).toHaveLength(2);

    expect((await get(`${tasksUrl(slug)}/${unknownId()}/activity`)).status).toBe(404);
  });
});

describe('workspace audit log', () => {
  it('is limited to settings:manage and filters by area', async () => {
    expect((await get(auditUrl(), team.developer)).status).toBe(403);
    expect((await get(auditUrl(), team.viewer)).status).toBe(403);

    const project = await http().post(`/api/workspaces/${slug}/projects`).set(bearer(team.owner.token)).send({ name: 'Audit Project' });
    expect(project.status).toBe(201);

    const res = await get(`${auditUrl()}?area=project`);
    expect(res.status).toBe(200);
    expect(res.body.retentionDays).toBe(365);
    expect(res.body.items.length).toBeGreaterThan(0);
    expect(res.body.items.every((item: { action: string }) => item.action.startsWith('project.'))).toBe(true);
    expect(res.body.items[0]).toMatchObject({ action: 'project.created', summary: 'Audit Project' });
  });

  it('exports CSV safely and records the export', async () => {
    await createTask(team.owner, slug, { title: '=HYPERLINK("http://evil")' });
    const res = await get(`${auditUrl()}?format=csv`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.headers['content-disposition']).toMatch(/attachment; filename="audit-/);
    expect(res.text).toContain('"time","actor","action"');
    // Formulas are neutralised for spreadsheet apps
    expect(res.text).toContain(`"'=HYPERLINK(""http://evil"")"`);

    const log = await get(`${auditUrl()}?area=audit`);
    expect(log.body.items[0].action).toBe('audit.exported');
  });
});
