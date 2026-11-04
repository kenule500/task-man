import {
  bearer, createTeam, createWorkspace, http, registerUser, startApp, stopApp, tasksUrl, unknownId, type TestUser,
} from './harness.js';
import { jiraCsv, trelloJson } from '../__tests__/importers/fixtures.js';

beforeAll(startApp);
afterAll(stopApp);

type Team = Awaited<ReturnType<typeof createTeam>>;
type Row = { _id: string; [key: string]: any };
let team: Team;
let slug: string;
let outsider: TestUser;
let foreignSlug: string;

beforeAll(async () => {
  team = await createTeam();
  slug = team.workspace.slug;
  outsider = await registerUser('Foreign Importer');
  foreignSlug = (await createWorkspace(outsider, 'Foreign Import')).slug;
});

const importUrl = (action: 'preview' | 'commit', where = slug) => `/api/workspaces/${where}/import/${action}`;
const preview = (body: object, user: TestUser = team.owner, where = slug) =>
  http().post(importUrl('preview', where)).set(bearer(user.token)).send(body);
const commit = (body: object, user: TestUser = team.owner, where = slug) =>
  http().post(importUrl('commit', where)).set(bearer(user.token)).send(body);
const listTasks = async (where = slug, user: TestUser = team.owner) =>
  (await http().get(tasksUrl(where)).set(bearer(user.token))).body as Row[];
const inProject = async (name: string, where = slug, user: TestUser = team.owner) =>
  (await listTasks(where, user)).filter(task => task.project === name);
const auditOf = async (where = slug, user: TestUser = team.owner) =>
  (await http().get(`/api/workspaces/${where}/activity?limit=100`).set(bearer(user.token))).body.items as
    { action: string; summary: string; changes: { field: string; to?: string }[] }[];

let counter = 0;
const projectName = (prefix: string) => `${prefix} ${Date.now().toString(36)}${counter++}`;

const csvText = (): string => [
  'title,description,status,priority,type,labels,assignee_email,due_date,start_date,story_points,parent_id,id',
  `Design login,"Wireframes, prototype",In progress,high,story,"design,ux",${team.developer.email},2030-06-15,2030-06-01,5,,T-1`,
  'Review copy,,To do,medium,task,content,,2030-06-20,,,T-1,T-2',
  `Deploy,,Done,low,bug,,nobody@elsewhere.test,2030-06-25,,,,T-3`,
].join('\r\n') + '\r\n';

const csvMapping = (name: string, extra: object = {}) => ({
  project: { name },
  statusMap: { 'In progress': 'in-progress', 'To do': 'pending', Done: 'completed' },
  userMap: {},
  typeMap: {},
  createSprints: false,
  includeComments: true,
  ...extra,
});

describe('import preview', () => {
  it('summarises a CSV without saving anything', async () => {
    const before = (await listTasks()).length;
    const res = await preview({ source: 'csv', content: csvText() });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ source: 'csv', total: 3, skipped: 0, withParent: 1, limit: 2000 });
    expect(res.body.columns).toEqual(['In progress', 'To do', 'Done']);
    expect(res.body.statuses).toEqual([
      { name: 'In progress', count: 1, suggested: 'in-progress' },
      { name: 'To do', count: 1, suggested: 'pending' },
      { name: 'Done', count: 1, suggested: 'completed' },
    ]);
    expect(res.body.types).toEqual(expect.arrayContaining([{ name: 'bug', count: 1, suggested: 'bug' }]));
    expect(res.body.labels).toEqual(expect.arrayContaining([{ name: 'ux', count: 1 }]));
    expect(res.body.people).toEqual(expect.arrayContaining([
      { identifier: team.developer.email, count: 1, isMember: true, memberId: team.developer.id, memberName: 'Dan Developer' },
      { identifier: 'nobody@elsewhere.test', count: 1, isMember: false, memberId: null, memberName: null },
    ]));
    expect(res.body.members).toEqual(expect.arrayContaining([{ id: team.developer.id, name: 'Dan Developer' }]));
    expect(res.body.members[0]).not.toHaveProperty('email');
    expect(res.body.stages.map((stage: { key: string }) => stage.key)).toEqual(expect.arrayContaining(['todo', 'done']));
    expect(res.body.items).toHaveLength(3);
    expect((await listTasks()).length).toBe(before);
  });

  it('reads a Trello board export and matches people by name', async () => {
    const res = await preview({ source: 'trello', content: trelloJson() });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ total: 3, skipped: 2, columns: ['To Do', 'Doing', 'Done'] });
    expect(res.body.warnings.join(' ')).toMatch(/archived/);
    expect(res.body.people).toEqual(expect.arrayContaining([
      expect.objectContaining({ identifier: 'Dan Developer', isMember: true, memberId: team.developer.id }),
      expect.objectContaining({ identifier: 'Grace Hopper', isMember: false }),
    ]));
    expect(res.body.comments).toBe(1);
  });

  it('reads a Jira CSV export with types, sprints and epic links', async () => {
    const res = await preview({ source: 'jira', content: jiraCsv() });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ total: 4, withParent: 1, withEpic: 1, comments: 1 });
    expect(res.body.types).toEqual(expect.arrayContaining([
      { name: 'Epic', count: 1, suggested: 'epic' }, { name: 'Sub-task', count: 1, suggested: 'task' }, { name: 'Bug', count: 1, suggested: 'bug' },
    ]));
    expect(res.body.sprints).toEqual(expect.arrayContaining([{ name: 'Sprint 1', count: 1 }, { name: 'Sprint 2', count: 2 }]));
  });

  it('rejects bad input with readable messages', async () => {
    expect((await preview({ source: 'asana', content: 'x' })).status).toBe(400);
    expect((await preview({ source: 'csv' })).status).toBe(400);
    expect((await preview({ source: 'csv', content: '' })).status).toBe(400);
    const notJson = await preview({ source: 'trello', content: 'nope' });
    expect(notJson.status).toBe(400);
    expect(notJson.body.message).toMatch(/not valid JSON/);
    const noTitle = await preview({ source: 'csv', content: 'colour\nred\n' });
    expect(noTitle.body.message).toMatch(/No title column/);
  });

  it('accepts a file near 2 MB and rejects one over it', async () => {
    const rows = ['title,description'];
    let size = 0;
    while (size < 1_900_000) {
      rows.push(`Task ${rows.length},${'lorem ipsum '.repeat(40)}`);
      size += rows[rows.length - 1].length + 1;
    }
    const big = await preview({ source: 'csv', content: rows.join('\n') });
    expect(big.status).toBe(200);
    expect(big.body.total).toBeGreaterThan(2000);
    expect(big.body.warnings[0]).toMatch(/at most 2000/);

    const tooBig = await preview({ source: 'csv', content: `title\n${'x'.repeat(2_100_000)}` });
    expect(tooBig.status).toBe(400);
  });

  it('keeps the 100 kB limit on the other routes', async () => {
    const res = await http().post(tasksUrl(slug)).set(bearer(team.owner.token)).send({ title: 'x'.repeat(150_000), deadline: '2030-01-01' });
    expect(res.status).toBe(413);
  });
});

describe('import commit: CSV', () => {
  it('creates tasks in a new project with mapped statuses, people, parents and numbers', async () => {
    const name = projectName('CSV Import');
    const res = await commit({ source: 'csv', content: csvText(), mapping: csvMapping(name, { project: { name, key: 'CSVI' } }) });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ created: 3, skipped: 0, project: { name, key: 'CSVI' } });

    const tasks = await inProject(name);
    expect(tasks).toHaveLength(3);
    const byTitle = Object.fromEntries(tasks.map(task => [task.title, task]));
    expect(byTitle['Design login']).toMatchObject({
      status: 'in-progress', stage: 'in-progress', priority: 'high', type: 'story', storyPoints: 5, labels: ['design', 'ux'],
      description: 'Wireframes, prototype', deadline: '2030-06-15T00:00:00.000Z', startDate: '2030-06-01T00:00:00.000Z',
    });
    expect(byTitle['Design login'].assignees.map((user: { _id: string }) => user._id)).toEqual([team.developer.id]);
    expect(byTitle['Design login'].assignees[0].email).toBeUndefined();
    expect(byTitle['Review copy']).toMatchObject({ status: 'pending', stage: 'todo', parent: byTitle['Design login']._id });
    expect(byTitle.Deploy).toMatchObject({ status: 'completed', stage: 'done', type: 'bug', assignees: [] });
    expect(byTitle.Deploy.completedAt).toBeTruthy();

    const numbers = tasks.map(task => task.number).sort((a, b) => a - b);
    expect(new Set(numbers).size).toBe(3);
    expect(numbers[2] - numbers[0]).toBe(2);

    const entry = (await auditOf()).find(item => item.action === 'import.completed' && item.summary.includes(name));
    expect(entry).toBeDefined();
    expect(entry?.changes).toEqual(expect.arrayContaining([{ field: 'created', to: '3' }, { field: 'source', to: 'csv' }]));
  });

  it('imports into an existing project (case-insensitive) and continues the task numbers', async () => {
    const name = projectName('Existing');
    expect((await http().post(`/api/workspaces/${slug}/projects`).set(bearer(team.owner.token)).send({ name })).status).toBe(201);
    const first = await commit({ source: 'csv', content: csvText(), mapping: csvMapping(name.toUpperCase(), { project: name.toUpperCase() }) });
    expect(first.status).toBe(201);
    expect(first.body.project.name).toBe(name);
    const second = await commit({ source: 'csv', content: csvText(), mapping: csvMapping(name, { project: name }) });
    expect(second.body.created).toBe(3);
    const tasks = await inProject(name);
    expect(tasks).toHaveLength(6);
    expect(new Set(tasks.map(task => task.number)).size).toBe(6);
  });

  it('maps people explicitly, including to unassigned, and to workflow stages', async () => {
    const name = projectName('Mapping');
    const res = await commit({
      source: 'csv',
      content: csvText(),
      mapping: csvMapping(name, {
        statusMap: { 'In progress': 'done', 'To do': 'todo', Done: 'completed' },
        userMap: { [team.developer.email]: null, 'nobody@elsewhere.test': team.viewer.id },
        typeMap: { story: 'spike' },
      }),
    });
    expect(res.status).toBe(201);
    const byTitle = Object.fromEntries((await inProject(name)).map(task => [task.title, task]));
    expect(byTitle['Design login']).toMatchObject({ status: 'completed', stage: 'done', type: 'spike', assignees: [] });
    expect(byTitle.Deploy.assignees.map((user: { _id: string }) => user._id)).toEqual([team.viewer.id]);
  });

  it('falls back to suggested statuses and matching members when the mapping is empty', async () => {
    const name = projectName('Suggested');
    const res = await commit({ source: 'csv', content: csvText(), mapping: { project: { name } } });
    expect(res.status).toBe(201);
    const byTitle = Object.fromEntries((await inProject(name)).map(task => [task.title, task]));
    expect(byTitle['Design login']).toMatchObject({ status: 'in-progress' });
    expect(byTitle['Design login'].assignees).toHaveLength(1);
    expect(byTitle.Deploy.status).toBe('completed');
  });

  it('skips untitled rows, drops start dates after the due date and reports warnings', async () => {
    const name = projectName('Warnings');
    const content = 'title,status,due_date,start_date\n,Todo,2030-01-01,\nHas no dates,Todo,,\nBackwards,Todo,2030-01-01,2030-02-01\n';
    const res = await commit({ source: 'csv', content, mapping: { project: { name } } });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ created: 2, skipped: 1 });
    expect(res.body.warnings.join(' ')).toMatch(/without a title/);
    expect(res.body.warnings.join(' ')).toMatch(/no date in the file/);
    expect(res.body.warnings.join(' ')).toMatch(/after the due date/);
    const backwards = (await inProject(name)).find(task => task.title === 'Backwards');
    expect(backwards?.startDate).toBeUndefined();
  });

  it('flattens subtasks of subtasks and ignores parents that are missing', async () => {
    const name = projectName('Links');
    const content = 'id,title,parent_id\nA,Top,\nB,Child,A\nC,Grandchild,B\nD,Orphan,ZZZ\n';
    const res = await commit({ source: 'csv', content, mapping: { project: { name } } });
    expect(res.status).toBe(201);
    const byTitle = Object.fromEntries((await inProject(name)).map(task => [task.title, task]));
    expect(byTitle.Child.parent).toBe(byTitle.Top._id);
    expect(byTitle.Grandchild.parent).toBeNull();
    expect(byTitle.Orphan.parent).toBeNull();
    expect(res.body.warnings.join(' ')).toMatch(/one level deep/);
  });

  it('strips control characters and cuts long text instead of failing', async () => {
    const name = projectName('Sanitize');
    const content = `title,description,labels\n"Bad\u0000 ti\u0007tle ${'x'.repeat(200)}","${'d'.repeat(2500)}","${Array.from({ length: 15 }, (_, i) => `label${i}`).join(',')}"\n`;
    const res = await commit({ source: 'csv', content, mapping: { project: { name } } });
    expect(res.status).toBe(201);
    const [task] = await inProject(name);
    expect(task.title).toHaveLength(140);
    expect(task.title).not.toMatch(/[\u0000-\u0008]/);
    expect(task.description).toHaveLength(2000);
    expect(task.labels).toHaveLength(10);
  });
});

describe('import commit: Jira', () => {
  it('imports epics, subtasks, sprints, people and comments', async () => {
    const name = projectName('Jira Import');
    const res = await commit({
      source: 'jira',
      content: jiraCsv(),
      mapping: {
        project: { name },
        statusMap: { 'To Do': 'pending', 'In Progress': 'in-progress', Done: 'completed' },
        userMap: { 'Dan Developer': team.developer.id },
        typeMap: { Epic: 'epic', Story: 'story', 'Sub-task': 'task', Bug: 'bug' },
        createSprints: true,
        includeComments: true,
      },
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ created: 4, skipped: 0, sprintsCreated: 2 });

    const byTitle = Object.fromEntries((await inProject(name)).map(task => [task.title, task]));
    const epic = byTitle['Checkout epic'];
    const story = byTitle['Add card form'];
    const sub = byTitle['Validate card number'];
    const bug = byTitle['Fix crash on submit'];
    expect(epic).toMatchObject({ type: 'epic', epic: null, parent: null, sprint: null });
    expect(story).toMatchObject({ type: 'story', status: 'in-progress', priority: 'medium', epic: epic._id, storyPoints: 5, labels: ['frontend', 'payments'] });
    expect(story.description).toBe('Line one\nline two with "quotes"');
    expect(sub).toMatchObject({ parent: story._id, epic: epic._id, storyPoints: 2, priority: 'low' });
    expect(sub.sprint).toBe(story.sprint);
    expect(bug).toMatchObject({ type: 'bug', status: 'completed', priority: 'high', deadline: '2024-03-18T00:00:00.000Z' });
    expect(story.sprint).toBeTruthy();
    expect(bug.sprint).toBeTruthy();
    expect(bug.sprint).not.toBe(story.sprint);
    expect(story.assignees.map((user: { _id: string }) => user._id)).toEqual([team.developer.id]);

    // The comment author is a Jira account id, so it is kept as an imported comment by the importer
    expect(story.comments).toHaveLength(1);
    expect(story.comments[0].text).toBe('Imported comment: Looks good; ship it');
    expect(story.comments[0].author._id).toBe(team.owner.id);

    const projects = (await http().get(`/api/workspaces/${slug}/projects`).set(bearer(team.owner.token))).body as
      { name: string; sprints: { name: string; status: string }[] }[];
    expect(projects.find(project => project.name === name)?.sprints.map(sprint => sprint.name).sort()).toEqual(['Sprint 1', 'Sprint 2']);
  });

  it('keeps items in the backlog when sprints are not to be created, and can leave comments out', async () => {
    const name = projectName('Jira Plain');
    const res = await commit({
      source: 'jira', content: jiraCsv(),
      mapping: { project: { name }, createSprints: false, includeComments: false },
    });
    expect(res.status).toBe(201);
    expect(res.body.sprintsCreated).toBe(0);
    expect(res.body.warnings.join(' ')).toMatch(/sprints? named in the file/);
    const tasks = await inProject(name);
    expect(tasks.every(task => !task.sprint)).toBe(true);
    expect(tasks.every(task => task.comments.length === 0)).toBe(true);
  });

  it('reuses a sprint that already exists in the project', async () => {
    const name = projectName('Jira Reuse');
    const created = await http().post(`/api/workspaces/${slug}/projects`).set(bearer(team.owner.token)).send({ name });
    const sprint = await http().post(`/api/workspaces/${slug}/projects/${created.body._id}/sprints`).set(bearer(team.owner.token))
      .send({ name: 'sprint 2', startDate: '2030-01-01', endDate: '2030-01-14' });
    expect(sprint.status).toBe(201);
    const res = await commit({ source: 'jira', content: jiraCsv(), mapping: { project: name, createSprints: true } });
    expect(res.status).toBe(201);
    expect(res.body.sprintsCreated).toBe(1);
    const story = (await inProject(name)).find(task => task.title === 'Add card form');
    expect(story?.sprint).toBe(sprint.body._id);
  });

  it('imports an epic as a plain task when the type map says so', async () => {
    const name = projectName('Jira Types');
    const res = await commit({ source: 'jira', content: jiraCsv(), mapping: { project: { name }, typeMap: { Epic: 'task' } } });
    expect(res.status).toBe(201);
    const byTitle = Object.fromEntries((await inProject(name)).map(task => [task.title, task]));
    expect(byTitle['Checkout epic'].type).toBe('task');
    expect(byTitle['Add card form'].epic).toBeNull();
  });
});

describe('import commit: Trello', () => {
  it('imports cards with lists as statuses, checklists, labels and comments', async () => {
    const name = projectName('Trello Import');
    const res = await commit({
      source: 'trello',
      content: trelloJson(),
      mapping: {
        project: { name },
        statusMap: { 'To Do': 'todo', Doing: 'in-progress', Done: 'completed' },
        userMap: { 'Grace Hopper': team.productOwner.id },
        includeComments: true,
      },
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ created: 3, skipped: 2 });

    const byTitle = Object.fromEntries((await inProject(name)).map(task => [task.title, task]));
    const card = byTitle['Design landing page'];
    expect(card).toMatchObject({ status: 'in-progress', description: 'Hero, pricing and footer.', labels: ['design', 'red'], deadline: '2030-06-15T00:00:00.000Z' });
    expect(card.checklist.map((item: { text: string; done: boolean }) => [item.text, item.done])).toEqual([['Mobile layout', true], ['Dark mode', false]]);
    // Dan is matched by name automatically
    expect(card.assignees.map((user: { _id: string }) => user._id)).toEqual([team.developer.id]);
    // Grace was mapped to a member, so the comment is hers
    expect(card.comments).toHaveLength(1);
    expect(card.comments[0].author._id).toBe(team.productOwner.id);
    expect(card.comments[0].text).toBe('Use the new brand colours.');
    expect(card.comments[0].createdAt).toBe('2030-05-20T10:30:00.000Z');
    expect(byTitle['Write copy'].assignees.map((user: { _id: string }) => user._id)).toEqual([team.productOwner.id]);
    expect(byTitle['Ship it'].status).toBe('completed');
  });
});

describe('import commit: rules and limits', () => {
  it('refuses more than 2,000 items and files with nothing in them', async () => {
    const rows = ['title'];
    for (let i = 0; i < 2001; i++) rows.push(`Task ${i}`);
    const name = projectName('Too Many');
    const res = await commit({ source: 'csv', content: rows.join('\n'), mapping: { project: { name } } });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/at most 2000/);
    const projects = (await http().get(`/api/workspaces/${slug}/projects`).set(bearer(team.owner.token))).body as { name: string }[];
    expect(projects.some(project => project.name === name)).toBe(false);

    const empty = await commit({ source: 'csv', content: 'title\n,\n', mapping: { project: { name } } });
    expect(empty.status).toBe(400);
  });

  it('accepts exactly 2,000 items', async () => {
    const rows = ['title,status'];
    for (let i = 0; i < 2000; i++) rows.push(`Bulk ${i},To do`);
    const name = projectName('Exactly Max');
    const res = await commit({ source: 'csv', content: rows.join('\n'), mapping: { project: { name } } });
    expect(res.status).toBe(201);
    expect(res.body.created).toBe(2000);
    expect(await inProject(name)).toHaveLength(2000);
  });

  it('validates the mapping', async () => {
    const name = projectName('Bad Mapping');
    const bad = (mapping: object) => commit({ source: 'csv', content: csvText(), mapping });
    expect((await bad({})).status).toBe(400);
    expect((await bad({ project: { name }, statusMap: { 'To do': 'nonsense' } })).status).toBe(400);
    expect((await bad({ project: { name }, typeMap: { story: 'saga' } })).status).toBe(400);
    expect((await bad({ project: { name }, userMap: { a: unknownId() } })).status).toBe(400);
    expect((await bad({ project: { name }, userMap: { a: outsider.id } })).status).toBe(400);
    expect((await bad({ project: { name, key: 'bad key!' } })).status).toBe(400);
    expect((await bad({ project: { name }, statusMap: [] })).status).toBe(400);
    expect((await bad({ project: { $ne: 'x' } })).status).toBe(400);
    expect((await bad({ project: 'No such project' })).status).toBe(400);
    const projects = (await http().get(`/api/workspaces/${slug}/projects`).set(bearer(team.owner.token))).body as { name: string }[];
    expect(projects.some(project => project.name === name)).toBe(false);
  });

  it('does not treat a status named like an object property as a mapping key', async () => {
    const name = projectName('Proto');
    const content = 'title,status\nOne,constructor\nTwo,__proto__\n';
    const res = await commit({ source: 'csv', content, mapping: { project: { name }, statusMap: { constructor: 'completed' } } });
    expect(res.status).toBe(201);
    const byTitle = Object.fromEntries((await inProject(name)).map(task => [task.title, task]));
    expect(byTitle.One.status).toBe('completed');
    expect(byTitle.Two.status).toBe('pending');
  });

  it('refuses a new project whose name is taken', async () => {
    const name = projectName('Taken');
    expect((await commit({ source: 'csv', content: csvText(), mapping: { project: { name } } })).status).toBe(201);
    const again = await commit({ source: 'csv', content: csvText(), mapping: { project: { name: name.toLowerCase() } } });
    expect(again.status).toBe(409);
  });
});

describe('import permissions and isolation', () => {
  it('needs a signed-in member who can write tasks', async () => {
    const body = { source: 'csv', content: csvText(), mapping: { project: { name: projectName('Denied') } } };
    expect((await http().post(importUrl('preview')).send(body)).status).toBe(401);
    expect((await http().post(importUrl('commit')).send(body)).status).toBe(401);
    expect((await preview(body, team.viewer)).status).toBe(403);
    expect((await commit(body, team.viewer)).status).toBe(403);
    expect((await preview(body, outsider)).status).toBe(403);
    expect((await commit(body, outsider)).status).toBe(403);
    expect((await commit(body, team.owner, 'no-such-workspace')).status).toBe(403);
  });

  it('lets a developer import into an existing project but not create projects or sprints', async () => {
    const name = projectName('Dev Import');
    const created = await http().post(`/api/workspaces/${slug}/projects`).set(bearer(team.owner.token)).send({ name });
    expect(created.status).toBe(201);

    const newProject = await commit({ source: 'csv', content: csvText(), mapping: { project: { name: projectName('Dev New') } } }, team.developer);
    expect(newProject.status).toBe(403);

    const res = await commit({ source: 'jira', content: jiraCsv(), mapping: { project: name, createSprints: true } }, team.developer);
    expect(res.status).toBe(201);
    expect(res.body.created).toBe(4);
    expect(res.body.sprintsCreated).toBe(0);
    expect(res.body.warnings.join(' ')).toMatch(/cannot create sprints/);
    expect((await inProject(name)).every(task => !task.sprint)).toBe(true);
  });

  it('works with a personal API token that has the tasks:write scope', async () => {
    const minted = async (scopes: string[]) => (await http().post(`/api/workspaces/${slug}/tokens`).set(bearer(team.owner.token))
      .send({ name: 'Importer', scopes })).body.token as string;
    const writer = await minted(['tasks:write', 'projects:write']);
    const reader = await minted(['tasks:read']);
    const name = projectName('Token Import');
    const body = { source: 'csv', content: csvText(), mapping: { project: { name } } };
    expect((await http().post(importUrl('commit')).set(bearer(reader)).send(body)).status).toBe(403);
    const res = await http().post(importUrl('commit')).set(bearer(writer)).send(body);
    expect(res.status).toBe(201);
    expect(res.body.created).toBe(3);
  });

  it('keeps workspaces apart', async () => {
    const before = (await listTasks(foreignSlug, outsider)).length;
    const name = projectName('Isolated');
    expect((await commit({ source: 'csv', content: csvText(), mapping: { project: { name } } })).status).toBe(201);
    expect(await listTasks(foreignSlug, outsider)).toHaveLength(before);

    // A project of one workspace cannot be imported into from another, and members of another workspace cannot be mapped
    const foreign = await commit({ source: 'csv', content: csvText(), mapping: { project: name } }, outsider, foreignSlug);
    expect(foreign.status).toBe(400);
    expect(foreign.body.message).toMatch(/Project not found/);
    const crossUser = await commit(
      { source: 'csv', content: csvText(), mapping: { project: { name: projectName('Cross') }, userMap: { a: team.developer.id } } },
      outsider, foreignSlug,
    );
    expect(crossUser.status).toBe(400);
    expect((await listTasks(foreignSlug, outsider)).length).toBe(before);

    // The import is recorded in the workspace that ran it only
    expect((await auditOf(foreignSlug, outsider)).some(item => item.action === 'import.completed')).toBe(false);
  });
});
