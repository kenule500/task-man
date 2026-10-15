import {
  bearer, createTask, createTeam, createWorkspace, http, joinAs, registerUser, startApp, stopApp, tasksUrl, unknownId,
  type TestUser,
} from './harness.js';

beforeAll(startApp);
afterAll(stopApp);

type Team = Awaited<ReturnType<typeof createTeam>>;
let team: Team;
let slug: string;
let scrumMaster: TestUser;

beforeAll(async () => {
  team = await createTeam();
  slug = team.workspace.slug;
  scrumMaster = await registerUser('Sam Scrum');
  await joinAs(team.workspace, team.owner, scrumMaster, 'Scrum Master');
});

const projectsUrl = () => `/api/workspaces/${slug}/projects`;
const releasesUrl = () => `/api/workspaces/${slug}/releases`;
const as = (user: TestUser) => ({
  get: (url: string) => http().get(url).set(bearer(user.token)),
  post: (url: string, body: object = {}) => http().post(url).set(bearer(user.token)).send(body),
  patch: (url: string, body: object) => http().patch(url).set(bearer(user.token)).send(body),
  del: (url: string) => http().delete(url).set(bearer(user.token)),
});
const owner = () => as(team.owner);

const createProject = async (body: object = {}) => {
  const res = await owner().post(projectsUrl(), { name: `Project ${unknownId().slice(0, 6)}`, ...body });
  expect(res.status).toBe(201);
  return res.body as { _id: string; name: string; key: string };
};
const createRelease = async (projectId: string, body: object = {}, user: TestUser = team.owner) => {
  const res = await as(user).post(releasesUrl(), { project: projectId, name: `v${unknownId().slice(0, 4)}`, ...body });
  expect(res.status).toBe(201);
  return res.body as { _id: string; name: string; status: string; progress: any };
};
const taskIn = (id: string) => async () =>
  ((await owner().get(tasksUrl(slug))).body as { _id: string; release: string | null }[]).find(t => t._id === id)!;

describe('releases CRUD', () => {
  it('creates, lists, edits, archives and deletes a release', async () => {
    const project = await createProject();
    const created = await owner().post(releasesUrl(), {
      project: project._id, name: ' v1.0.0 ', description: 'First', startDate: '2030-01-01', releaseDate: '2030-02-01',
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ name: 'v1.0.0', description: 'First', status: 'unreleased', releasedAt: null });
    expect(created.body.progress).toMatchObject({ overdue: false, counts: { total: 0 }, points: { total: 0 } });
    expect(created.body.nameKey).toBeUndefined();

    const id = created.body._id as string;
    const list = await owner().get(`${releasesUrl()}?project=${project._id}`);
    expect(list.status).toBe(200);
    expect(list.body.map((r: { _id: string }) => r._id)).toEqual([id]);

    const edited = await owner().patch(`${releasesUrl()}/${id}`, { name: 'v1.0.1', releaseDate: '2030-03-01', description: 'Second' });
    expect(edited.body).toMatchObject({ name: 'v1.0.1', description: 'Second' });
    expect(String(edited.body.releaseDate)).toContain('2030-03-01');

    const archived = await owner().patch(`${releasesUrl()}/${id}`, { status: 'archived' });
    expect(archived.body.status).toBe('archived');
    expect((await owner().patch(`${releasesUrl()}/${id}`, { status: 'released' })).status).toBe(400);

    expect((await owner().del(`${releasesUrl()}/${id}`)).status).toBe(200);
    expect((await owner().get(`${releasesUrl()}/${id}`)).status).toBe(404);
  });

  it('validates input, rejects duplicate names per project and unknown projects', async () => {
    const project = await createProject();
    const other = await createProject();
    await createRelease(project._id, { name: 'v2.0' });
    expect((await owner().post(releasesUrl(), { project: project._id, name: 'V2.0' })).status).toBe(409);
    // The same name is fine in another project
    expect((await owner().post(releasesUrl(), { project: other._id, name: 'v2.0' })).status).toBe(201);

    const bad = await owner().post(releasesUrl(), { project: 'nope', name: '', releaseDate: 'soon' });
    expect(bad.status).toBe(400);
    expect(bad.body.errors.map((e: { path: string }) => e.path).sort()).toEqual(['name', 'project', 'releaseDate']);
    expect((await owner().post(releasesUrl(), { project: project._id, name: { $gt: '' } })).status).toBe(400);
    expect((await owner().post(releasesUrl(), { project: unknownId(), name: 'v9' })).status).toBe(400);
    expect((await owner().post(releasesUrl(), { project: project._id, name: 'v3', startDate: '2030-05-01', releaseDate: '2030-04-01' })).status).toBe(400);
    expect((await owner().get(`${releasesUrl()}?project=zzz`)).status).toBe(400);
  });

  it('flags an open release past its date as overdue', async () => {
    const project = await createProject();
    const late = await createRelease(project._id, { releaseDate: '2020-01-01' });
    expect(late.progress.overdue).toBe(true);
    const future = await createRelease(project._id, { releaseDate: '2099-01-01' });
    expect(future.progress.overdue).toBe(false);
  });
});

describe('release progress and assignment', () => {
  it('reports counts and points by status group', async () => {
    const project = await createProject();
    const release = await createRelease(project._id);
    await createTask(team.owner, slug, { project: project.name, release: release._id, status: 'completed', storyPoints: 5 });
    await createTask(team.owner, slug, { project: project.name, release: release._id, status: 'in-progress', storyPoints: 3 });
    const open = await createTask(team.owner, slug, { project: project.name, release: release._id, storyPoints: 2 });
    expect(open.release).toBe(release._id);
    // Subtasks follow their parent and do not count twice
    const sub = await createTask(team.owner, slug, { title: 'Sub', parent: open._id });
    expect(sub.release).toBe(release._id);

    const list = await owner().get(`${releasesUrl()}?project=${project._id}`);
    expect(list.body[0].progress).toMatchObject({
      counts: { pending: 1, 'in-progress': 1, completed: 1, total: 3 },
      points: { pending: 2, 'in-progress': 3, completed: 5, total: 10 },
    });

    const detail = await owner().get(`${releasesUrl()}/${release._id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.project).toMatchObject({ name: project.name, key: project.key });
    expect(detail.body.tasks).toHaveLength(3);
    expect(detail.body.tasks[0].key).toMatch(new RegExp(`^${project.key}-\\d+$`));
  });

  it('assigns existing tasks, adopting the release project when the task has none', async () => {
    const project = await createProject();
    const release = await createRelease(project._id);
    const task = await createTask(team.owner, slug, {});
    const res = await owner().patch(`${tasksUrl(slug)}/${task._id}`, { release: release._id });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ release: release._id, project: project.name });

    const cleared = await owner().patch(`${tasksUrl(slug)}/${task._id}`, { release: null });
    expect(cleared.body.release).toBeNull();
  });

  it('rejects a release of another project, an unknown one and an epic', async () => {
    const project = await createProject();
    const other = await createProject();
    const release = await createRelease(other._id);
    const wrong = await owner().post(tasksUrl(slug), { title: 'X', deadline: '2030-06-15', project: project.name, release: release._id });
    expect(wrong.status).toBe(400);
    expect(wrong.body.message).toMatch(/another project/);

    const task = await createTask(team.owner, slug, { project: project.name });
    expect((await owner().patch(`${tasksUrl(slug)}/${task._id}`, { release: release._id })).status).toBe(400);
    expect((await owner().patch(`${tasksUrl(slug)}/${task._id}`, { release: unknownId() })).status).toBe(400);
    expect((await owner().patch(`${tasksUrl(slug)}/${task._id}`, { release: { $ne: null } })).status).toBe(400);

    const mine = await createRelease(project._id);
    const epic = await owner().post(tasksUrl(slug), { title: 'Epic', deadline: '2030-06-15', type: 'epic', project: project.name, release: mine._id });
    expect(epic.status).toBe(400);
  });

  it('drops the release when the task moves to another project', async () => {
    const project = await createProject();
    const other = await createProject();
    const release = await createRelease(project._id);
    const task = await createTask(team.owner, slug, { project: project.name, release: release._id });
    const moved = await owner().patch(`${tasksUrl(slug)}/${task._id}`, { project: other.name });
    expect(moved.status).toBe(200);
    expect(moved.body.release).toBeNull();
  });

  it('refuses released and archived releases for new tasks but keeps the existing ones', async () => {
    const project = await createProject();
    const release = await createRelease(project._id);
    const kept = await createTask(team.owner, slug, { project: project.name, release: release._id, status: 'completed' });
    expect((await owner().post(`${releasesUrl()}/${release._id}/release`, {})).status).toBe(200);

    const refused = await owner().post(tasksUrl(slug), { title: 'Late', deadline: '2030-06-15', project: project.name, release: release._id });
    expect(refused.status).toBe(400);
    expect(refused.body.message).toMatch(/released/);
    expect((await taskIn(kept._id)()).release).toBe(release._id);
    // Other edits of a task already in the release still work
    expect((await owner().patch(`${tasksUrl(slug)}/${kept._id}`, { title: 'Renamed' })).status).toBe(200);

    const archived = await createRelease(project._id);
    await owner().patch(`${releasesUrl()}/${archived._id}`, { status: 'archived' });
    const task = await createTask(team.owner, slug, { project: project.name });
    expect((await owner().patch(`${tasksUrl(slug)}/${task._id}`, { release: archived._id })).status).toBe(400);
  });

  it('assigns a release in bulk with the same rules', async () => {
    const project = await createProject();
    const other = await createProject();
    const release = await createRelease(project._id);
    const a = await createTask(team.owner, slug, { project: project.name });
    const b = await createTask(team.owner, slug, {});
    const stranger = await createTask(team.owner, slug, { project: other.name });

    const bad = await owner().patch(`${tasksUrl(slug)}/bulk`, { ids: [a._id, stranger._id], patch: { release: release._id } });
    expect(bad.status).toBe(400);
    expect((await taskIn(a._id)()).release).toBeNull();

    const ok = await owner().patch(`${tasksUrl(slug)}/bulk`, { ids: [a._id, b._id], patch: { release: release._id } });
    expect(ok.status).toBe(200);
    expect(ok.body.tasks.map((t: { release: string }) => t.release)).toEqual([release._id, release._id]);

    const cleared = await owner().patch(`${tasksUrl(slug)}/bulk`, { ids: [a._id], patch: { release: null } });
    expect(cleared.body.tasks[0].release).toBeNull();
  });

  it('deleting a release unassigns its tasks', async () => {
    const project = await createProject();
    const release = await createRelease(project._id);
    const task = await createTask(team.owner, slug, { project: project.name, release: release._id });
    expect((await owner().del(`${releasesUrl()}/${release._id}`)).status).toBe(200);
    expect((await taskIn(task._id)()).release).toBeNull();
  });
});

describe('releasing', () => {
  it('moves unfinished tasks (and their subtasks) to another release', async () => {
    const project = await createProject();
    const current = await createRelease(project._id, { name: 'v1' });
    const next = await createRelease(project._id, { name: 'v2' });
    const done = await createTask(team.owner, slug, { project: project.name, release: current._id, status: 'completed' });
    const open = await createTask(team.owner, slug, { project: project.name, release: current._id });
    const sub = await createTask(team.owner, slug, { title: 'Sub', parent: open._id });

    expect((await owner().post(`${releasesUrl()}/${current._id}/release`, { moveOpenTo: current._id })).status).toBe(400);
    const res = await owner().post(`${releasesUrl()}/${current._id}/release`, { moveOpenTo: next._id });
    expect(res.status).toBe(200);
    expect(res.body.movedTasks).toBe(1);
    expect(res.body.release).toMatchObject({ status: 'released' });
    expect(res.body.release.releasedAt).toBeTruthy();

    expect((await taskIn(done._id)()).release).toBe(current._id);
    expect((await taskIn(open._id)()).release).toBe(next._id);
    expect((await taskIn(sub._id)()).release).toBe(next._id);

    // A second release is refused
    expect((await owner().post(`${releasesUrl()}/${current._id}/release`, {})).status).toBe(400);
    // Reopening makes it assignable again
    const reopened = await owner().patch(`${releasesUrl()}/${current._id}`, { status: 'unreleased' });
    expect(reopened.body).toMatchObject({ status: 'unreleased', releasedAt: null });
  });

  it('can unassign unfinished tasks, leave them, and refuses released or foreign targets', async () => {
    const project = await createProject();
    const other = await createProject();
    const foreign = await createRelease(other._id);

    const release = await createRelease(project._id);
    const open = await createTask(team.owner, slug, { project: project.name, release: release._id });
    expect((await owner().post(`${releasesUrl()}/${release._id}/release`, { moveOpenTo: foreign._id })).status).toBe(400);
    expect((await owner().post(`${releasesUrl()}/${release._id}/release`, { moveOpenTo: unknownId() })).status).toBe(400);
    expect((await owner().post(`${releasesUrl()}/${release._id}/release`, { moveOpenTo: 'x' })).status).toBe(400);
    expect((await owner().post(`${releasesUrl()}/${release._id}/release`, { moveOpenTo: null })).status).toBe(200);
    expect((await taskIn(open._id)()).release).toBeNull();

    const keep = await createRelease(project._id);
    const stays = await createTask(team.owner, slug, { project: project.name, release: keep._id });
    expect((await owner().post(`${releasesUrl()}/${keep._id}/release`, {})).status).toBe(200);
    expect((await taskIn(stays._id)()).release).toBe(keep._id);
  });
});

describe('release notes', () => {
  it('groups finished work by type with task keys, as Markdown and JSON', async () => {
    const project = await createProject({ key: 'SHIP' });
    const release = await createRelease(project._id, { name: 'v3.0', releaseDate: '2030-04-01', description: 'Big one' });
    await createTask(team.owner, slug, { title: 'Dark mode', type: 'story', project: project.name, release: release._id, status: 'completed' });
    const bug = await createTask(team.owner, slug, { title: 'Fix login loop', type: 'bug', project: project.name, release: release._id, status: 'completed' });
    await createTask(team.owner, slug, { title: 'Chore', type: 'task', project: project.name, release: release._id, status: 'completed' });
    await createTask(team.owner, slug, { title: 'Still open', type: 'story', project: project.name, release: release._id });

    const res = await owner().get(`${releasesUrl()}/${release._id}/notes`);
    expect(res.status).toBe(200);
    expect(res.body.groups.map((g: { heading: string }) => g.heading)).toEqual(['Features', 'Fixes', 'Tasks']);
    expect(res.body.markdown).toContain('# v3.0');
    expect(res.body.markdown).toContain('Planned 2030-04-01');
    expect(res.body.markdown).toContain('## Features\n\n- SHIP-');
    expect(res.body.markdown).toMatch(/- SHIP-[0-9]+ Dark mode/);
    expect(res.body.markdown).toContain('Fix login loop');
    expect(res.body.markdown).not.toContain('Still open');
    expect(res.body.groups[1].items[0]).toMatchObject({ id: bug._id, title: 'Fix login loop' });

    const md = await owner().get(`${releasesUrl()}/${release._id}/notes?format=markdown`);
    expect(md.status).toBe(200);
    expect(md.headers['content-type']).toMatch(/text\/markdown/);
    expect(md.text).toBe(res.body.markdown);
  });
});

describe('permissions and isolation', () => {
  it('lets viewers read but only project writers change releases', async () => {
    const project = await createProject();
    const release = await createRelease(project._id);
    expect((await as(team.viewer).get(releasesUrl())).status).toBe(200);
    expect((await as(team.viewer).get(`${releasesUrl()}/${release._id}`)).status).toBe(200);
    expect((await as(team.viewer).get(`${releasesUrl()}/${release._id}/notes`)).status).toBe(200);
    expect((await as(team.viewer).post(releasesUrl(), { project: project._id, name: 'Nope' })).status).toBe(403);
    expect((await as(team.developer).patch(`${releasesUrl()}/${release._id}`, { name: 'Nope' })).status).toBe(403);
    expect((await as(team.developer).post(`${releasesUrl()}/${release._id}/release`, {})).status).toBe(403);
    expect((await as(team.developer).del(`${releasesUrl()}/${release._id}`)).status).toBe(403);
    expect((await as(scrumMaster).post(`${releasesUrl()}/${release._id}/release`, {})).status).toBe(200);
    expect((await http().get(releasesUrl())).status).toBe(401);
  });

  it('never exposes releases of another workspace', async () => {
    const outsider = await registerUser('Otto Outsider');
    const foreign = await createWorkspace(outsider, 'Foreign Releases');
    const foreignProject = await http().post(`/api/workspaces/${foreign.slug}/projects`).set(bearer(outsider.token)).send({ name: 'Secret' });
    const foreignRelease = await http().post(`/api/workspaces/${foreign.slug}/releases`).set(bearer(outsider.token))
      .send({ project: foreignProject.body._id, name: 'v0' });
    expect(foreignRelease.status).toBe(201);

    const id = foreignRelease.body._id as string;
    expect((await owner().get(`${releasesUrl()}/${id}`)).status).toBe(404);
    expect((await owner().get(`${releasesUrl()}/${id}/notes`)).status).toBe(404);
    expect((await owner().patch(`${releasesUrl()}/${id}`, { name: 'Stolen' })).status).toBe(404);
    expect((await owner().post(`${releasesUrl()}/${id}/release`, {})).status).toBe(404);
    expect((await owner().del(`${releasesUrl()}/${id}`)).status).toBe(404);
    // A foreign project cannot host a release, and a foreign release cannot receive local tasks
    expect((await owner().post(releasesUrl(), { project: foreignProject.body._id, name: 'v1' })).status).toBe(400);
    const task = await createTask(team.owner, slug, {});
    expect((await owner().patch(`${tasksUrl(slug)}/${task._id}`, { release: id })).status).toBe(400);
    expect((await owner().get(`/api/workspaces/${foreign.slug}/releases`)).status).toBe(403);
  });
});
