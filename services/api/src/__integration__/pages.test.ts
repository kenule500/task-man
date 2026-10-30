import {
  bearer, createTask, createTeam, http, registerUser, startApp, stopApp, unknownId, type TestUser,
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

const url = (path = '') => `/api/workspaces/${slug}/pages${path}`;
const withProject = (project?: string) => (project === undefined ? '' : `project=${encodeURIComponent(project)}`);

const as = (user: TestUser) => ({
  list: (project?: string) => http().get(`${url()}?${withProject(project)}`).set(bearer(user.token)),
  get: (id: string) => http().get(url(`/${id}`)).set(bearer(user.token)),
  create: (body: Record<string, unknown>) => http().post(url()).set(bearer(user.token)).send(body),
  patch: (id: string, body: Record<string, unknown>) => http().patch(url(`/${id}`)).set(bearer(user.token)).send(body),
  remove: (id: string) => http().delete(url(`/${id}`)).set(bearer(user.token)),
  move: (id: string, body: Record<string, unknown>) => http().post(url(`/${id}/move`)).set(bearer(user.token)).send(body),
  versions: (id: string) => http().get(url(`/${id}/versions`)).set(bearer(user.token)),
  version: (id: string, version: number) => http().get(url(`/${id}/versions/${version}`)).set(bearer(user.token)),
  restore: (id: string, version: number) => http().post(url(`/${id}/restore/${version}`)).set(bearer(user.token)),
  search: (q: string, project?: string) =>
    http().get(`${url('/search')}?q=${encodeURIComponent(q)}&${withProject(project)}`).set(bearer(user.token)),
});

let o: ReturnType<typeof as>;
let dev: ReturnType<typeof as>;
let viewer: ReturnType<typeof as>;
let stranger: ReturnType<typeof as>;
beforeAll(() => {
  o = as(team.owner);
  dev = as(team.developer);
  viewer = as(team.viewer);
  stranger = as(outsider);
});

const titles = (body: { title: string }[]) => body.map(page => page.title);

describe('pages: access', () => {
  it('requires a session and membership', async () => {
    expect((await http().get(url())).status).toBe(401);
    expect((await stranger.list()).status).toBe(403);
    expect((await stranger.create({ title: 'x' })).status).toBe(403);
  });

  it('lets a viewer read but not write or delete', async () => {
    const page = (await dev.create({ title: 'Read only' })).body;
    expect((await viewer.get(page._id)).status).toBe(200);
    expect((await viewer.list()).status).toBe(200);
    expect((await viewer.create({ title: 'nope' })).status).toBe(403);
    expect((await viewer.patch(page._id, { version: 1, title: 'nope' })).status).toBe(403);
    expect((await viewer.remove(page._id)).status).toBe(403);
  });

  it('does not show pages of another workspace', async () => {
    const foreign = await registerUser('Fran Foreign');
    const ws = (await http().post('/api/workspaces').set(bearer(foreign.token)).send({ name: 'Other place' })).body;
    const made = await http().post(`/api/workspaces/${ws.slug}/pages`).set(bearer(foreign.token)).send({ title: 'Secret plan' });
    expect(made.status).toBe(201);
    expect((await o.get(made.body._id)).status).toBe(404);
    expect(titles((await o.list()).body)).not.toContain('Secret plan');
    expect((await o.search('Secret')).body).toEqual([]);
  });
});

describe('pages: create, read, validate', () => {
  it('creates a page with a slug and shows it in the tree without content', async () => {
    const res = await dev.create({ title: '  Onboarding guide  ', content: '# Welcome' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      title: 'Onboarding guide', slug: 'onboarding-guide', content: '# Welcome', version: 1, parent: null, project: '', archived: false,
    });
    expect(res.body.createdBy).toMatchObject({ _id: team.developer.id, name: 'Dan Developer' });
    expect(res.body.mentions).toEqual([]);

    const tree = await o.list();
    const entry = tree.body.find((page: { _id: string }) => page._id === res.body._id);
    expect(entry).toBeDefined();
    expect(entry.content).toBeUndefined();

    const full = await o.get(res.body._id);
    expect(full.body.content).toBe('# Welcome');
  });

  it('gives duplicate titles distinct slugs', async () => {
    const first = await o.create({ title: 'Duplicate' });
    const second = await o.create({ title: 'Duplicate' });
    expect(first.body.slug).toBe('duplicate');
    expect(second.body.slug).toBe('duplicate-2');
  });

  it('rejects bad input', async () => {
    expect((await o.create({})).status).toBe(400);
    expect((await o.create({ title: 'x'.repeat(121) })).status).toBe(400);
    expect((await o.create({ title: 'ok', content: 'x'.repeat(100_001) })).status).toBe(400);
    expect((await o.create({ title: 'ok', parent: 'nope' })).status).toBe(400);
    expect((await o.create({ title: 'ok', parent: unknownId() })).status).toBe(400);
    expect((await o.create({ title: 'ok', project: 'No such project' })).status).toBe(400);
    expect((await o.get('not-an-id')).status).toBe(404);
    expect((await o.get(unknownId())).status).toBe(404);
  });

  it('accepts a page of 100,000 characters', async () => {
    const res = await o.create({ title: 'Big page', content: 'a'.repeat(100_000) });
    expect(res.status).toBe(201);
    expect(res.body.content).toHaveLength(100_000);
  });
});

describe('pages: nesting and moving', () => {
  it('nests up to three levels and refuses a fourth', async () => {
    const a = (await o.create({ title: 'Nest A' })).body;
    const b = (await o.create({ title: 'Nest B', parent: a._id })).body;
    const c = (await o.create({ title: 'Nest C', parent: b._id })).body;
    expect(c.parent).toBe(b._id);
    const d = await o.create({ title: 'Nest D', parent: c._id });
    expect(d.status).toBe(400);
  });

  it('moves a page and keeps the sibling order', async () => {
    const root1 = (await o.create({ title: 'Move root 1' })).body;
    const root2 = (await o.create({ title: 'Move root 2' })).body;
    const child = (await o.create({ title: 'Move child', parent: root1._id })).body;

    // Indent root2 under root1, before child
    let tree = (await o.move(root2._id, { parent: root1._id, index: 0 })).body as { _id: string; parent: string | null; position: number }[];
    const kids = tree.filter(page => page.parent === root1._id).sort((x, y) => x.position - y.position).map(page => page._id);
    expect(kids).toEqual([root2._id, child._id]);

    // Cannot move a page under its own descendant, or beyond three levels
    expect((await o.move(root1._id, { parent: child._id })).status).toBe(400);
    const deep = (await o.create({ title: 'Move deep', parent: child._id })).body;
    expect((await o.move(root1._id, { parent: deep._id })).status).toBe(400);
    expect((await o.move(unknownId(), { parent: null })).status).toBe(404);

    // Back to the top
    tree = (await o.move(root2._id, { parent: null })).body;
    expect(tree.find(page => page._id === root2._id)?.parent).toBeNull();
  });
});

describe('pages: editing and conflicts', () => {
  it('requires the version and bumps it on every change', async () => {
    const page = (await o.create({ title: 'Versioned', content: 'one' })).body;
    expect((await o.patch(page._id, { content: 'two' })).status).toBe(400);

    const saved = await dev.patch(page._id, { version: 1, content: 'two' });
    expect(saved.status).toBe(200);
    expect(saved.body).toMatchObject({ content: 'two', version: 2 });
    expect(saved.body.updatedBy).toMatchObject({ name: 'Dan Developer' });

    // Nothing changed: no new version
    const same = await dev.patch(page._id, { version: 2, content: 'two', title: 'Versioned' });
    expect(same.status).toBe(200);
    expect(same.body.version).toBe(2);
  });

  it('answers 409 with the latest page when the version is stale', async () => {
    const page = (await o.create({ title: 'Contested', content: 'base' })).body;
    expect((await dev.patch(page._id, { version: 1, content: 'dev text' })).status).toBe(200);
    const stale = await o.patch(page._id, { version: 1, content: 'owner text' });
    expect(stale.status).toBe(409);
    expect(stale.body.page).toMatchObject({ content: 'dev text', version: 2 });
    expect(stale.body.page.updatedBy.name).toBe('Dan Developer');
    // Retrying on top of the latest version works
    expect((await o.patch(page._id, { version: 2, content: 'merged' })).body.version).toBe(3);
  });

  it('lets only one of two simultaneous saves win', async () => {
    const page = (await o.create({ title: 'Race', content: 'base' })).body;
    const [x, y] = await Promise.all([
      o.patch(page._id, { version: 1, content: 'from owner' }),
      dev.patch(page._id, { version: 1, content: 'from dev' }),
    ]);
    expect([x.status, y.status].sort()).toEqual([200, 409]);
  });

  it('archives a page without losing it', async () => {
    const page = (await o.create({ title: 'To archive' })).body;
    const res = await o.patch(page._id, { version: 1, archived: true });
    expect(res.body.archived).toBe(true);
    expect((await o.get(page._id)).status).toBe(200);
    expect((await o.search('To archive')).body).toEqual([]);
    expect((await o.patch(page._id, { version: 2, archived: 'yes' })).status).toBe(400);
  });
});

describe('pages: history', () => {
  it('keeps earlier versions and restores one as a new version', async () => {
    const page = (await o.create({ title: 'History', content: 'v1 text' })).body;
    await o.patch(page._id, { version: 1, content: 'v2 text' });
    await dev.patch(page._id, { version: 2, title: 'History renamed', content: 'v3 text' });

    const list = await o.versions(page._id);
    expect(list.status).toBe(200);
    expect(list.body.current).toBe(3);
    expect(list.body.versions.map((item: { version: number }) => item.version)).toEqual([2, 1]);
    expect(list.body.versions[0].editedBy.name).toBe('Olivia Owner');
    expect(list.body.versions[0].content).toBeUndefined();

    const one = await o.version(page._id, 1);
    expect(one.body).toMatchObject({ version: 1, title: 'History', content: 'v1 text' });
    expect((await o.version(page._id, 9)).status).toBe(404);

    const restored = await dev.restore(page._id, 1);
    expect(restored.status).toBe(200);
    expect(restored.body).toMatchObject({ title: 'History', content: 'v1 text', version: 4 });
    // The text it replaced is in the history now
    expect((await o.version(page._id, 3)).body.content).toBe('v3 text');
    expect((await o.restore(page._id, 77)).status).toBe(404);
    expect((await viewer.restore(page._id, 1)).status).toBe(403);
  });

  it('keeps only the last 20 versions', async () => {
    const page = (await o.create({ title: 'Many edits', content: '0' })).body;
    for (let n = 1; n <= 23; n += 1) {
      const res = await o.patch(page._id, { version: n, content: String(n) });
      expect(res.status).toBe(200);
    }
    const list = await o.versions(page._id);
    expect(list.body.current).toBe(24);
    expect(list.body.versions).toHaveLength(20);
    expect(list.body.versions[0].version).toBe(23);
    expect(list.body.versions.at(-1).version).toBe(4);
  });
});

describe('pages: delete', () => {
  it('moves children up one level and removes the history', async () => {
    const top = (await o.create({ title: 'Del top' })).body;
    const mid = (await o.create({ title: 'Del mid', parent: top._id })).body;
    const leaf = (await o.create({ title: 'Del leaf', parent: mid._id })).body;
    await o.patch(mid._id, { version: 1, content: 'edited' });

    expect((await dev.remove(mid._id)).status).toBe(403);
    expect((await o.remove(mid._id)).status).toBe(200);
    expect((await o.get(mid._id)).status).toBe(404);
    expect((await o.get(leaf._id)).body.parent).toBe(top._id);
    expect((await o.versions(mid._id)).status).toBe(404);
    expect((await o.remove(mid._id)).status).toBe(404);
  });
});

describe('pages: projects', () => {
  it('keeps project pages apart from workspace pages and follows renames', async () => {
    const project = (await http().post(`/api/workspaces/${slug}/projects`).set(bearer(team.owner.token)).send({ name: 'Wiki Project' })).body;
    const made = await o.create({ title: 'Project handbook', project: 'wiki project' });
    expect(made.status).toBe(201);
    expect(made.body.project).toBe('Wiki Project');

    expect(titles((await o.list('Wiki Project')).body)).toEqual(['Project handbook']);
    expect(titles((await o.list()).body)).not.toContain('Project handbook');
    // Same title and slug can exist in another wiki
    const sibling = await o.create({ title: 'Project handbook' });
    expect(sibling.body.slug).toBe('project-handbook');
    expect((await o.list('Missing project')).status).toBe(404);

    // A parent must belong to the same wiki
    expect((await o.create({ title: 'Cross', project: 'Wiki Project', parent: sibling.body._id })).status).toBe(400);

    const renamed = await http().patch(`/api/workspaces/${slug}/projects/${project._id}`).set(bearer(team.owner.token)).send({ name: 'Wiki Renamed' });
    expect(renamed.status).toBe(200);
    expect(titles((await o.list('Wiki Renamed')).body)).toEqual(['Project handbook']);
  });

  it('deletes the pages of a deleted project', async () => {
    const project = (await http().post(`/api/workspaces/${slug}/projects`).set(bearer(team.owner.token)).send({ name: 'Short lived' })).body;
    const page = (await o.create({ title: 'Doomed page', project: 'Short lived' })).body;
    const removed = await http().delete(`/api/workspaces/${slug}/projects/${project._id}`).set(bearer(team.owner.token));
    expect(removed.status).toBe(200);
    expect((await o.get(page._id)).status).toBe(404);
  });
});

describe('pages: mentions', () => {
  it('resolves task keys in the content to tasks of the workspace', async () => {
    const project = (await http().post(`/api/workspaces/${slug}/projects`).set(bearer(team.owner.token)).send({ name: 'Mention Project' })).body;
    const task = await createTask(team.owner, slug, { title: 'Fix the login', project: project.name });
    const key = `${project.key}-${task.number}`;

    const page = (await o.create({ title: 'Mentions', content: `Blocked by ${key}, also ZZZ-999 and ${key} again.` })).body;
    expect(page.mentions).toEqual([{ key, id: task._id, title: 'Fix the login', status: task.status }]);
    expect((await o.get(page._id)).body.mentions).toHaveLength(1);
  });
});

describe('pages: search', () => {
  it('finds pages by title and content, escapes the query and stays in the workspace', async () => {
    await o.create({ title: 'Deploy runbook', content: 'Run the pipeline (blue/green) then verify.' });
    await o.create({ title: 'Other', content: 'unrelated' });

    const byTitle = await dev.search('runbook');
    expect(titles(byTitle.body)).toEqual(['Deploy runbook']);

    const byContent = await viewer.search('(BLUE/green)');
    expect(titles(byContent.body)).toEqual(['Deploy runbook']);
    expect(byContent.body[0].snippet).toContain('blue/green');

    // Regex characters are literal
    expect((await o.search('.*')).body).toEqual([]);
    expect((await o.search('(x')).body).toEqual([]);
    expect((await o.search('a')).status).toBe(400);
    expect((await o.search('x'.repeat(101))).status).toBe(400);
    expect((await stranger.search('runbook')).status).toBe(403);
  });
});

describe('pages: audit trail', () => {
  it('records page.created, page.updated and page.deleted', async () => {
    const page = (await o.create({ title: 'Audited page' })).body;
    await o.patch(page._id, { version: 1, content: 'changed' });
    await o.remove(page._id);

    const log = await http().get(`/api/workspaces/${slug}/activity?area=page`).set(bearer(team.owner.token));
    expect(log.status).toBe(200);
    const mine = log.body.items.filter((item: { summary: string }) => item.summary === 'Audited page').map((item: { action: string }) => item.action);
    expect(mine).toEqual(['page.deleted', 'page.updated', 'page.created']);
    expect(log.body.areas).toContain('page');
  });
});
