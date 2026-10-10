import {
  bearer, createTask, createTeam, createWorkspace, http, registerUser, startApp, stopApp, tasksUrl, unknownId,
  type TestUser,
} from './harness.js';
import StatusTransition from '../models/statusTransitionModel.js';

beforeAll(startApp);
afterAll(stopApp);

type Team = Awaited<ReturnType<typeof createTeam>>;
type Created = { _id: string; [key: string]: any };

let team: Team;
let slug: string;

beforeAll(async () => {
  team = await createTeam();
  slug = team.workspace.slug;
});

const owner = () => team.owner;
const projectsUrl = (where = slug) => `/api/workspaces/${where}/projects`;
const flowUrl = (query = '', where = slug) => `/api/workspaces/${where}/reports/flow${query}`;
const call = (user: TestUser) => ({
  get: (url: string) => http().get(url).set(bearer(user.token)),
  post: (url: string, body: object = {}) => http().post(url).set(bearer(user.token)).send(body),
  patch: (url: string, body: object) => http().patch(url).set(bearer(user.token)).send(body),
});
const pause = (ms = 15) => new Promise(resolve => setTimeout(resolve, ms));

const move = async (task: Created, status: string) => {
  await pause();
  const res = await call(owner()).patch(`${tasksUrl(slug)}/${task._id}`, { status });
  expect(res.status).toBe(200);
};

const newProject = async () =>
  (await call(owner()).post(projectsUrl(), { name: `Flow ${unknownId().slice(0, 6)}` })).body as { _id: string; name: string; key: string };

const rowsOf = async (task: Created) =>
  (await StatusTransition.find({ task: task._id }).sort({ at: 1, _id: 1 }).lean()).map(row => [row.from, row.to]);

describe('status transition tracking', () => {
  it('records creation and every status change, and nothing else', async () => {
    const task = await createTask(owner(), slug, { title: 'Tracked' });
    await move(task, 'in-progress');
    await move(task, 'completed');
    await move(task, 'in-progress');
    expect((await call(owner()).patch(`${tasksUrl(slug)}/${task._id}`, { title: 'Renamed' })).status).toBe(200);
    expect(await rowsOf(task)).toEqual([
      [null, 'pending'], ['pending', 'in-progress'], ['in-progress', 'completed'], ['completed', 'in-progress'],
    ]);

    const row = await StatusTransition.findOne({ task: task._id, to: 'completed' }).lean();
    expect(row).toMatchObject({ workspace: expect.anything(), type: 'task', project: '' });
    expect(String(row?.actor)).toBe(owner().id);
  });

  it('records the project and sprint of the task and a task created already completed', async () => {
    const project = await newProject();
    const sprint = (await call(owner()).post(`${projectsUrl()}/${project._id}/sprints`, {
      name: 'Sprint 1', startDate: '2030-01-06', endDate: '2030-01-19',
    })).body as { _id: string };
    const task = await createTask(owner(), slug, { title: 'In a sprint', sprint: sprint._id, status: 'completed' });
    const row = await StatusTransition.findOne({ task: task._id }).lean();
    expect(row).toMatchObject({ from: null, to: 'completed', project: project.name });
    expect(String(row?.sprint)).toBe(sprint._id);
  });

  it('skips subtasks and epics', async () => {
    const parent = await createTask(owner(), slug, { title: 'Parent' });
    const sub = await createTask(owner(), slug, { title: 'Sub', parent: parent._id });
    const epic = await createTask(owner(), slug, { title: 'Epic', type: 'epic' });
    await move(sub, 'completed');
    await move(epic, 'completed');
    expect(await rowsOf(sub)).toEqual([]);
    expect(await rowsOf(epic)).toEqual([]);
    expect(await rowsOf(parent)).toEqual([[null, 'pending']]);
  });
});

describe('GET /reports/flow', () => {
  it('reports cumulative flow, cycle and lead time, aging work and throughput for a project', async () => {
    const project = await newProject();
    const inProject = { project: project.name };
    const done = await createTask(owner(), slug, { title: 'Done', ...inProject });
    const doing = await createTask(owner(), slug, { title: 'Doing', ...inProject, assignees: [owner().id] });
    await createTask(owner(), slug, { title: 'Waiting', ...inProject });
    await createTask(owner(), slug, { title: 'Subtask is ignored', ...inProject, parent: done._id });
    await createTask(owner(), slug, { title: 'Epic is ignored', ...inProject, type: 'epic' });
    await createTask(owner(), slug, { title: 'Other project' });
    await move(done, 'in-progress');
    await move(doing, 'in-progress');
    await move(done, 'completed');

    const res = await call(owner()).get(flowUrl(`?project=${encodeURIComponent(project.name)}`));
    expect(res.status).toBe(200);
    expect(res.body.range.days).toBe(30);

    const today = res.body.cfd.at(-1);
    expect(res.body.cfd).toHaveLength(30);
    expect(today).toMatchObject({ date: res.body.range.to, pending: 1, inProgress: 1, completed: 1 });
    expect(res.body.cfd[0]).toMatchObject({ pending: 0, inProgress: 0, completed: 0 });

    expect(res.body.cycleTime).toMatchObject({ count: 1 });
    expect(res.body.cycleTime.points[0]).toMatchObject({ taskId: done._id, title: 'Done', key: `${project.key}-${done.number}` });
    expect(res.body.cycleTime.p85).toBeGreaterThanOrEqual(0);
    expect(res.body.cycleTime.p85).toBeLessThan(1);
    expect(res.body.leadTime.count).toBe(1);

    expect(res.body.aging).toHaveLength(1);
    expect(res.body.aging[0]).toMatchObject({ taskId: doing._id, title: 'Doing', project: project.name });
    expect(res.body.aging[0].assignees[0]).toMatchObject({ _id: owner().id, name: 'Olivia Owner' });

    expect(res.body.throughput.reduce((sum: number, week: { count: number }) => sum + week.count, 0)).toBe(1);
  });

  it('counts a reopened task once it is completed again and drops it while it is open', async () => {
    const project = await newProject();
    const task = await createTask(owner(), slug, { title: 'Reopened', project: project.name });
    await move(task, 'in-progress');
    await move(task, 'completed');
    await move(task, 'in-progress');
    const url = flowUrl(`?project=${encodeURIComponent(project.name)}`);
    expect((await call(owner()).get(url)).body.cycleTime.count).toBe(0);
    expect((await call(owner()).get(url)).body.aging).toHaveLength(1);

    await move(task, 'completed');
    const after = await call(owner()).get(url);
    expect(after.body.cycleTime.count).toBe(1);
    expect(after.body.aging).toHaveLength(0);
  });

  it('filters by sprint', async () => {
    const project = await newProject();
    const sprint = (await call(owner()).post(`${projectsUrl()}/${project._id}/sprints`, {
      name: 'Sprint 1', startDate: '2030-01-06', endDate: '2030-01-19',
    })).body as { _id: string };
    const inSprint = await createTask(owner(), slug, { title: 'In sprint', sprint: sprint._id });
    await createTask(owner(), slug, { title: 'Backlog item', project: project.name });
    await move(inSprint, 'in-progress');

    const res = await call(owner()).get(flowUrl(`?sprint=${sprint._id}`));
    expect(res.status).toBe(200);
    expect(res.body.cfd.at(-1)).toMatchObject({ pending: 0, inProgress: 1, completed: 0 });
    expect(res.body.aging.map((item: { title: string }) => item.title)).toEqual(['In sprint']);

    const empty = await call(owner()).get(flowUrl(`?sprint=${unknownId()}`));
    expect(empty.status).toBe(200);
    expect(empty.body.cfd.at(-1)).toMatchObject({ pending: 0, inProgress: 0, completed: 0 });
  });

  it('rebuilds the history of tasks that have no recorded transitions', async () => {
    const project = await newProject();
    const old = await createTask(owner(), slug, { title: 'Legacy', project: project.name, status: 'in-progress' });
    await StatusTransition.deleteMany({ task: old._id });
    const res = await call(owner()).get(flowUrl(`?project=${encodeURIComponent(project.name)}`));
    expect(res.body.cfd.at(-1)).toMatchObject({ inProgress: 1 });
    expect(res.body.aging[0]).toMatchObject({ taskId: old._id });
  });

  it('honours the from and to days', async () => {
    const project = await newProject();
    await createTask(owner(), slug, { title: 'Today', project: project.name });
    const res = await call(owner()).get(flowUrl(`?project=${encodeURIComponent(project.name)}&from=2020-01-01&to=2020-01-10`));
    expect(res.status).toBe(200);
    expect(res.body.range).toEqual({ from: '2020-01-01', to: '2020-01-10', days: 10 });
    expect(res.body.cfd.every((day: { pending: number }) => day.pending === 0)).toBe(true);
    expect(res.body.cycleTime.count).toBe(0);
  });

  it('is readable by a viewer, hidden from other workspaces and needs a token', async () => {
    expect((await call(team.viewer).get(flowUrl())).status).toBe(200);

    const stranger = await registerUser('Sue Stranger');
    expect((await call(stranger).get(flowUrl())).status).toBe(403);
    const other = await createWorkspace(stranger, `Other ${unknownId().slice(0, 6)}`);
    const own = await call(stranger).get(flowUrl('', other.slug));
    expect(own.status).toBe(200);
    expect(own.body.cfd.at(-1)).toMatchObject({ pending: 0, inProgress: 0, completed: 0 });

    expect((await http().get(flowUrl())).status).toBe(401);
  });

  it.each([
    ['unreal day', '?from=2030-02-30'],
    ['malformed day', '?to=yesterday'],
    ['start after end', '?from=2030-02-10&to=2030-02-01'],
    ['range over 180 days', '?from=2029-01-01&to=2030-01-01'],
    ['malformed sprint id', '?sprint=not-an-id'],
    ['repeated project', '?project=a&project=b'],
    ['repeated from', '?from=2030-01-01&from=2030-01-02'],
    ['over-long project', `?project=${'x'.repeat(61)}`],
  ])('answers 400 for %s', async (_label, query) => {
    const res = await call(owner()).get(flowUrl(query));
    expect(res.status).toBe(400);
    expect(res.body.message).toEqual(expect.any(String));
  });
});
