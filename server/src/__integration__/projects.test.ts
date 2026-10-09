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
const sprintsUrl = (projectId: string) => `${projectsUrl()}/${projectId}/sprints`;
const createSprint = async (projectId: string, body: object = {}, user: TestUser = team.owner) => {
  const res = await as(user).post(sprintsUrl(projectId), {
    name: 'Sprint 1', startDate: '2030-01-06', endDate: '2030-01-19', ...body,
  });
  expect(res.status).toBe(201);
  return res.body as { _id: string; status: string };
};

describe('projects', () => {
  it('creates a project with defaults and a generated key', async () => {
    const res = await owner().post(projectsUrl(), { name: 'Mobile App', description: 'iOS and Android' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      name: 'Mobile App', key: 'MA', description: 'iOS and Android', color: 'blue', icon: 'folder', archived: false, sprints: [],
    });
    expect(res.body.nameKey).toBeUndefined();
  });

  it('rejects duplicate names (case-insensitive) with 409 and invalid fields with 400', async () => {
    await createProject({ name: 'Website' });
    expect((await owner().post(projectsUrl(), { name: 'website' })).status).toBe(409);
    const bad = await owner().post(projectsUrl(), { name: 'X', color: 'neon', icon: '<svg>', key: 'toolongkey' });
    expect(bad.status).toBe(400);
    expect(bad.body.errors.map((e: { path: string }) => e.path).sort()).toEqual(['color', 'icon', 'key']);
    expect((await owner().post(projectsUrl(), { name: { $gt: '' } })).status).toBe(400);
  });

  it('lists projects created from existing task project names', async () => {
    await createTask(team.owner, slug, { title: 'Legacy', project: 'Legacy Platform' });
    const res = await owner().get(projectsUrl());
    expect(res.status).toBe(200);
    expect(res.body.find((p: { name: string }) => p.name === 'Legacy Platform')).toMatchObject({ key: 'LP', sprints: [] });
  });

  it('renames a project and moves its tasks along', async () => {
    const project = await createProject({ name: 'Old Name' });
    const task = await createTask(team.owner, slug, { project: 'Old Name' });
    const res = await owner().patch(`${projectsUrl()}/${project._id}`, { name: 'New Name', color: 'violet', icon: 'rocket' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: 'New Name', color: 'violet', icon: 'rocket' });
    const tasks = await owner().get(tasksUrl(slug));
    expect(tasks.body.find((t: { _id: string }) => t._id === task._id).project).toBe('New Name');
  });

  it('deleting a project keeps its tasks without project or sprint', async () => {
    const project = await createProject();
    const sprint = await createSprint(project._id);
    const task = await createTask(team.owner, slug, { sprint: sprint._id });
    expect(task.project).toBe(project.name);

    expect((await owner().del(`${projectsUrl()}/${project._id}`)).status).toBe(200);
    const tasks = await owner().get(tasksUrl(slug));
    expect(tasks.body.find((t: { _id: string }) => t._id === task._id)).toMatchObject({ project: '', sprint: null });
  });

  it('enforces project permissions per role', async () => {
    const project = await createProject();
    expect((await as(team.viewer).get(projectsUrl())).status).toBe(200);
    expect((await as(team.viewer).post(projectsUrl(), { name: 'Nope' })).status).toBe(403);
    expect((await as(team.developer).patch(`${projectsUrl()}/${project._id}`, { name: 'Nope' })).status).toBe(403);
    // Scrum Masters plan work but cannot delete projects
    expect((await as(scrumMaster).patch(`${projectsUrl()}/${project._id}`, { description: 'Planned' })).status).toBe(200);
    expect((await as(scrumMaster).del(`${projectsUrl()}/${project._id}`)).status).toBe(403);
  });

  it('never exposes projects of another workspace', async () => {
    const outsider = await registerUser('Otto Outsider');
    const foreign = await createWorkspace(outsider, 'Foreign Projects');
    const res = await http().post(`/api/workspaces/${foreign.slug}/projects`).set(bearer(outsider.token)).send({ name: 'Secret' });
    expect(res.status).toBe(201);
    expect((await owner().patch(`${projectsUrl()}/${res.body._id}`, { name: 'Stolen' })).status).toBe(404);
    expect((await owner().del(`${projectsUrl()}/${res.body._id}`)).status).toBe(404);
    expect((await owner().get(`/api/workspaces/${foreign.slug}/projects`)).status).toBe(403);
  });
});

describe('sprints', () => {
  it('plans, starts and completes a sprint, moving open tasks to the backlog', async () => {
    const project = await createProject();
    const sprint = await createSprint(project._id, {}, scrumMaster);
    expect(sprint.status).toBe('planned');

    const done = await createTask(team.owner, slug, { sprint: sprint._id, storyPoints: 5, status: 'completed' });
    const open = await createTask(team.owner, slug, { sprint: sprint._id, storyPoints: 3 });
    expect(done.project).toBe(project.name);

    const started = await as(scrumMaster).post(`${sprintsUrl(project._id)}/${sprint._id}/start`);
    expect(started.status).toBe(200);
    expect(started.body.status).toBe('active');
    expect((await as(scrumMaster).post(`${sprintsUrl(project._id)}/${sprint._id}/start`)).status).toBe(400);

    const completed = await as(scrumMaster).post(`${sprintsUrl(project._id)}/${sprint._id}/complete`, { moveOpenTo: 'backlog' });
    expect(completed.status).toBe(200);
    expect(completed.body).toMatchObject({ sprint: { status: 'completed', completedPoints: 5 }, movedTasks: 1 });

    const tasks = (await owner().get(tasksUrl(slug))).body as { _id: string; sprint: string | null }[];
    expect(tasks.find(t => t._id === open._id)?.sprint).toBeNull();
    expect(tasks.find(t => t._id === done._id)?.sprint).toBe(sprint._id);
  });

  it('allows one active sprint per project and can roll open work into a planned sprint', async () => {
    const project = await createProject();
    const first = await createSprint(project._id, { name: 'Sprint A' });
    const second = await createSprint(project._id, { name: 'Sprint B', startDate: '2030-01-20', endDate: '2030-02-02' });
    const open = await createTask(team.owner, slug, { sprint: first._id });

    expect((await owner().post(`${sprintsUrl(project._id)}/${first._id}/start`)).status).toBe(200);
    expect((await owner().post(`${sprintsUrl(project._id)}/${second._id}/start`)).status).toBe(409);

    const res = await owner().post(`${sprintsUrl(project._id)}/${first._id}/complete`, { moveOpenTo: second._id });
    expect(res.status).toBe(200);
    const tasks = (await owner().get(tasksUrl(slug))).body as { _id: string; sprint: string | null }[];
    expect(tasks.find(t => t._id === open._id)?.sprint).toBe(second._id);
  });

  it('validates sprint input and blocks tasks from joining a completed sprint', async () => {
    const project = await createProject();
    const backwards = await owner().post(sprintsUrl(project._id), { name: 'Bad', startDate: '2030-02-01', endDate: '2030-01-01' });
    expect(backwards.status).toBe(400);
    expect((await owner().post(sprintsUrl(project._id), { name: '', startDate: 'x', endDate: 'y' })).status).toBe(400);

    const sprint = await createSprint(project._id);
    await owner().post(`${sprintsUrl(project._id)}/${sprint._id}/start`);
    await owner().post(`${sprintsUrl(project._id)}/${sprint._id}/complete`);
    const res = await http().post(tasksUrl(slug)).set(bearer(team.owner.token))
      .send({ title: 'Late', deadline: '2030-06-15', sprint: sprint._id });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/completed/);
  });

  it('deleting a sprint sends its tasks back to the backlog', async () => {
    const project = await createProject();
    const sprint = await createSprint(project._id);
    const task = await createTask(team.owner, slug, { sprint: sprint._id });
    expect((await as(team.developer).del(`${sprintsUrl(project._id)}/${sprint._id}`)).status).toBe(403);
    expect((await owner().del(`${sprintsUrl(project._id)}/${sprint._id}`)).status).toBe(200);
    const tasks = (await owner().get(tasksUrl(slug))).body as { _id: string; sprint: string | null }[];
    expect(tasks.find(t => t._id === task._id)?.sprint).toBeNull();
  });

  it('rejects sprints of another project or workspace', async () => {
    const project = await createProject();
    const other = await createProject();
    const sprint = await createSprint(other._id);
    expect((await owner().post(`${sprintsUrl(project._id)}/${sprint._id}/start`)).status).toBe(404);
    const res = await http().post(tasksUrl(slug)).set(bearer(team.owner.token))
      .send({ title: 'Ghost', deadline: '2030-06-15', sprint: unknownId() });
    expect(res.status).toBe(400);
  });
});

describe('scrum task fields and subtasks', () => {
  it('stores type and story points and validates them', async () => {
    const task = await createTask(team.owner, slug, { type: 'bug', storyPoints: 8 });
    expect(task).toMatchObject({ type: 'bug', storyPoints: 8, sprint: null, parent: null });
    const bad = await http().post(tasksUrl(slug)).set(bearer(team.owner.token))
      .send({ title: 'Bad', deadline: '2030-06-15', type: 'epicfail', storyPoints: 1000 });
    expect(bad.status).toBe(400);
    expect(bad.body.errors.map((e: { path: string }) => e.path).sort()).toEqual(['storyPoints', 'type']);
  });

  it('subtasks inherit project and sprint, are one level deep, and follow their parent', async () => {
    const project = await createProject();
    const sprint = await createSprint(project._id);
    const parent = await createTask(team.owner, slug, { title: 'Story', type: 'story', sprint: sprint._id });
    const child = await createTask(team.owner, slug, { title: 'Sub', parent: parent._id });
    expect(child).toMatchObject({ parent: parent._id, project: project.name, sprint: sprint._id });

    const nested = await http().post(tasksUrl(slug)).set(bearer(team.owner.token))
      .send({ title: 'Too deep', deadline: '2030-06-15', parent: child._id });
    expect(nested.status).toBe(400);
    const self = await http().patch(`${tasksUrl(slug)}/${parent._id}`).set(bearer(team.owner.token)).send({ parent: parent._id });
    expect(self.status).toBe(400);
    const hasChildren = await http().patch(`${tasksUrl(slug)}/${parent._id}`).set(bearer(team.owner.token)).send({ parent: child._id });
    expect(hasChildren.status).toBe(400);

    // Moving the parent to the backlog takes its subtasks along
    await http().patch(`${tasksUrl(slug)}/${parent._id}`).set(bearer(team.owner.token)).send({ sprint: null });
    const tasks = (await owner().get(tasksUrl(slug))).body as { _id: string; sprint: string | null }[];
    expect(tasks.find(t => t._id === child._id)?.sprint).toBeNull();
  });

  it('deleting a parent deletes its subtasks', async () => {
    const parent = await createTask(team.owner, slug, { title: 'Parent' });
    const child = await createTask(team.owner, slug, { title: 'Child', parent: parent._id });
    const res = await http().delete(`${tasksUrl(slug)}/${parent._id}`).set(bearer(team.owner.token));
    expect(res.status).toBe(200);
    expect(res.body.subtasks).toEqual([child._id]);
    const tasks = (await owner().get(tasksUrl(slug))).body as { _id: string }[];
    expect(tasks.some(t => t._id === child._id)).toBe(false);
  });

  it('assigning a sprint moves the task to the sprint project; changing project leaves the sprint', async () => {
    const project = await createProject();
    const sprint = await createSprint(project._id);
    const task = await createTask(team.owner, slug, { project: 'Somewhere else' });
    const moved = await http().patch(`${tasksUrl(slug)}/${task._id}`).set(bearer(team.owner.token)).send({ sprint: sprint._id });
    expect(moved.body).toMatchObject({ sprint: sprint._id, project: project.name });
    const left = await http().patch(`${tasksUrl(slug)}/${task._id}`).set(bearer(team.owner.token)).send({ project: 'Elsewhere' });
    expect(left.body).toMatchObject({ sprint: null, project: 'Elsewhere' });
  });
});

describe('/api/tasks alias', () => {
  it('serves the task API of the active workspace', async () => {
    const user = await registerUser('Alias User');
    const workspace = await createWorkspace(user, 'Alias Space');
    const created = await http().post('/api/tasks').set(bearer(user.token)).send({ title: 'Via alias', deadline: '2030-06-15' });
    expect(created.status).toBe(201);
    expect(created.body.workspace).toBe(workspace.id);

    const list = await http().get('/api/tasks?search=alias').set(bearer(user.token));
    expect(list.status).toBe(200);
    expect(list.body.map((t: { _id: string }) => t._id)).toEqual([created.body._id]);
    expect((await http().put(`/api/tasks/${created.body._id}`).set(bearer(user.token)).send({ status: 'completed' })).body.status)
      .toBe('completed');
    expect((await http().delete(`/api/tasks/${created.body._id}`).set(bearer(user.token))).status).toBe(200);
  });

  it('requires authentication and a workspace', async () => {
    expect((await http().get('/api/tasks')).status).toBe(401);
    const loner = await registerUser('No Workspace');
    expect((await http().get('/api/tasks').set(bearer(loner.token))).status).toBe(404);
  });
});
