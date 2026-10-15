import {
  bearer, createTask, createTeam, createWorkspace, http, registerUser, startApp, stopApp, tasksUrl, unknownId,
  type TestUser,
} from './harness.js';
import { classifySprintScope } from '../controllers/reportController.js';

beforeAll(startApp);
afterAll(stopApp);

type Team = Awaited<ReturnType<typeof createTeam>>;
type Item = { _id: string; title: string; storyPoints: number | null };

let team: Team;
let slug: string;

beforeAll(async () => {
  team = await createTeam();
  slug = team.workspace.slug;
});

const owner = () => team.owner;
const projectsUrl = (where = slug) => `/api/workspaces/${where}/projects`;
const call = (user: TestUser) => ({
  get: (url: string) => http().get(url).set(bearer(user.token)),
  post: (url: string, body: object = {}) => http().post(url).set(bearer(user.token)).send(body),
  patch: (url: string, body: object) => http().patch(url).set(bearer(user.token)).send(body),
});
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const reportUrl = (projectId: string, sprintId: string, where = slug) =>
  `${projectsUrl(where)}/${projectId}/sprints/${sprintId}/report`;

const setup = async () => {
  const project = (await call(owner()).post(projectsUrl(), { name: `Report ${unknownId().slice(0, 6)}` })).body as { _id: string };
  const sprint = (await call(owner()).post(`${projectsUrl()}/${project._id}/sprints`, {
    name: 'Sprint 1', startDate: '2030-01-06', endDate: '2030-01-19', goal: 'Ship it',
  })).body as { _id: string };
  return { project, sprint };
};

const titles = (items: Item[]) => items.map(item => item.title).sort();

describe('sprint report', () => {
  it('splits committed, added, removed, completed and not completed work', async () => {
    const { project, sprint } = await setup();
    const sprintId = sprint._id;
    const done = await createTask(owner(), slug, { title: 'Done', sprint: sprintId, storyPoints: 5 });
    const dropped = await createTask(owner(), slug, { title: 'Dropped', sprint: sprintId, storyPoints: 3, assignees: [owner().id] });
    const late = await createTask(owner(), slug, { title: 'Pulled in', storyPoints: 2 });
    await createTask(owner(), slug, { title: 'Subtask is ignored', sprint: sprintId, parent: done._id, storyPoints: 1 });

    // Planned sprint: everything in it is committed, nothing is added yet
    const planned = await call(owner()).get(reportUrl(project._id, sprintId));
    expect(planned.status).toBe(200);
    expect(planned.body.sprint).toMatchObject({ name: 'Sprint 1', goal: 'Ship it', status: 'planned' });
    expect(planned.body.summary.added.count).toBe(0);

    expect((await call(owner()).post(`${projectsUrl()}/${project._id}/sprints/${sprintId}/start`)).status).toBe(200);
    await pause(30);

    await createTask(owner(), slug, { title: 'Created later', sprint: sprintId, storyPoints: 8 });
    expect((await call(owner()).patch(`${tasksUrl(slug)}/${late._id}`, { sprint: sprintId })).status).toBe(200);
    expect((await call(owner()).patch(`${tasksUrl(slug)}/${dropped._id}`, { sprint: null })).status).toBe(200);
    expect((await call(owner()).patch(`${tasksUrl(slug)}/${done._id}`, { status: 'completed' })).status).toBe(200);

    const active = await call(owner()).get(reportUrl(project._id, sprintId));
    expect(active.status).toBe(200);
    expect(titles(active.body.committed)).toEqual(['Done', 'Dropped']);
    expect(titles(active.body.added)).toEqual(['Created later', 'Pulled in']);
    expect(titles(active.body.removed)).toEqual(['Dropped']);
    expect(titles(active.body.completed)).toEqual(['Done']);
    expect(titles(active.body.notCompleted)).toEqual(['Created later', 'Pulled in']);
    expect(active.body.summary).toMatchObject({
      committed: { count: 2, points: 8 },
      completed: { count: 1, points: 5 },
      notCompleted: { count: 2, points: 10 },
      added: { count: 2, points: 10 },
      removed: { count: 1, points: 3 },
    });
    expect(active.body.removed[0].assignees[0]).toMatchObject({ _id: owner().id, name: 'Olivia Owner' });

    // Completing moves the open tasks away silently; the report still knows who was moved in by hand
    const closed = await call(owner()).post(`${projectsUrl()}/${project._id}/sprints/${sprintId}/complete`, { moveOpenTo: 'backlog' });
    expect(closed.status).toBe(200);
    const after = await call(owner()).get(reportUrl(project._id, sprintId));
    expect(after.body.sprint.status).toBe('completed');
    expect(titles(after.body.completed)).toEqual(['Done']);
    expect(titles(after.body.notCompleted)).toContain('Pulled in');
    expect(titles(after.body.committed)).toEqual(['Done', 'Dropped']);
    expect(titles(after.body.removed)).toEqual(['Dropped']);
  });

  it('is readable by a viewer and hidden from other workspaces', async () => {
    const { project, sprint } = await setup();
    expect((await call(team.viewer).get(reportUrl(project._id, sprint._id))).status).toBe(200);

    const stranger = await registerUser('Sue Stranger');
    const other = await createWorkspace(stranger, `Other ${unknownId().slice(0, 6)}`);
    expect((await call(stranger).get(reportUrl(project._id, sprint._id, other.slug))).status).toBe(404);
    expect((await call(stranger).get(reportUrl(project._id, sprint._id))).status).toBe(403);
  });

  it('answers 404 for unknown or malformed ids and 401 without a token', async () => {
    const { project, sprint } = await setup();
    expect((await call(owner()).get(reportUrl(project._id, unknownId()))).status).toBe(404);
    expect((await call(owner()).get(reportUrl(project._id, 'not-an-id'))).status).toBe(404);
    expect((await call(owner()).get(reportUrl(unknownId(), sprint._id))).status).toBe(404);
    expect((await http().get(reportUrl(project._id, sprint._id))).status).toBe(401);
  });
});

describe('classifySprintScope', () => {
  const created = new Date('2030-01-01T00:00:00Z');
  const t = (day: number) => new Date(`2030-01-${String(day).padStart(2, '0')}T12:00:00Z`).getTime();
  const task = (inSprintNow: boolean, events: { at: number; kind: 'in' | 'out' }[], createdAt = created) =>
    ({ _id: 'x', createdAt, inSprintNow, events });

  it('treats a task moved in before the start as committed', () => {
    expect(classifySprintScope(task(true, [{ at: t(2), kind: 'in' }]), t(5))).toMatchObject({ committed: true, added: false, removed: false });
  });

  it('treats a task moved in after the start as added', () => {
    expect(classifySprintScope(task(true, [{ at: t(7), kind: 'in' }]), t(5))).toMatchObject({ committed: false, added: true });
  });

  it('counts a task created in the sprint before the start as committed and after it as added', () => {
    expect(classifySprintScope(task(true, [], created), t(5)).committed).toBe(true);
    expect(classifySprintScope(task(true, [], new Date(t(6))), t(5)).added).toBe(true);
  });

  it('marks a task moved out during the sprint as removed', () => {
    expect(classifySprintScope(task(false, [{ at: t(2), kind: 'in' }, { at: t(8), kind: 'out' }]), t(5)))
      .toMatchObject({ committed: true, removed: true, inAtEnd: false });
  });

  it('keeps a task that left silently (sprint completed) as part of the sprint', () => {
    expect(classifySprintScope(task(false, [{ at: t(2), kind: 'in' }]), t(5))).toMatchObject({ inAtEnd: true, removed: false });
  });

  it('ignores a task that never belonged to the sprint', () => {
    expect(classifySprintScope(task(false, []), t(5))).toEqual({ committed: false, added: false, removed: false, inAtEnd: false });
  });

  it('never reports added work for a sprint that has not started', () => {
    expect(classifySprintScope(task(true, [{ at: t(2), kind: 'in' }]), undefined)).toMatchObject({ committed: true, added: false });
  });
});
