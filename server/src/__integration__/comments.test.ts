import {
  bearer, createTask, createTeam, createWorkspace, http, joinAs, registerUser, startApp, stopApp, tasksUrl, unknownId,
  type TestUser,
} from './harness.js';

beforeAll(startApp);
afterAll(stopApp);

let team: Awaited<ReturnType<typeof createTeam>>;
let slug: string;
let teamMember: TestUser;
let outsider: TestUser;
let taskId: string;

beforeAll(async () => {
  team = await createTeam();
  slug = team.workspace.slug;
  teamMember = await registerUser('Tina Teammember');
  await joinAs(team.workspace, team.owner, teamMember, 'Team Member');
  outsider = await registerUser('Comment Outsider');
  taskId = (await createTask(team.owner, slug, { title: 'Discuss me' }))._id;
});

const commentsUrl = (id = taskId) => `${tasksUrl(slug)}/${id}/comments`;
const addComment = (user: TestUser, text: unknown, id = taskId) =>
  http().post(commentsUrl(id)).set(bearer(user.token)).send({ text });
const removeComment = (user: TestUser, commentId: string, id = taskId) =>
  http().delete(`${commentsUrl(id)}/${commentId}`).set(bearer(user.token));
const commentsOf = async (id = taskId) => {
  const res = await http().get(tasksUrl(slug)).set(bearer(team.owner.token));
  return (res.body.find((t: { _id: string }) => t._id === id)?.comments ?? []) as {
    _id: string; text: string; author: { _id: string; name: string }; createdAt: string;
  }[];
};

describe('comments: add', () => {
  it('adds a trimmed comment and returns the author without private fields', async () => {
    const res = await addComment(team.developer, '  Looks good to me  ');
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ text: 'Looks good to me' });
    expect(res.body.author).toMatchObject({ _id: team.developer.id, name: 'Dan Developer' });
    expect(Object.keys(res.body.author).sort()).toEqual(['_id', 'avatarUrl', 'name']);
    expect(JSON.stringify(res.body)).not.toContain(team.developer.email);
    expect(new Date(res.body.createdAt).getTime()).not.toBeNaN();
  });

  it('shows comments on the task list with populated authors, in order', async () => {
    await addComment(team.owner, 'Second comment');
    const comments = await commentsOf();
    expect(comments.map(c => c.text)).toEqual(['Looks good to me', 'Second comment']);
    expect(comments[0].author).toMatchObject({ name: 'Dan Developer' });
    expect(JSON.stringify(comments)).not.toMatch(/@example\.com/);
  });

  it('validates the text', async () => {
    expect((await addComment(team.developer, undefined)).status).toBe(400);
    expect((await addComment(team.developer, '')).status).toBe(400);
    expect((await addComment(team.developer, '   ')).status).toBe(400);
    expect((await addComment(team.developer, 42)).status).toBe(400);
    expect((await addComment(team.developer, { $ne: '' })).status).toBe(400);
    expect((await addComment(team.developer, 'c'.repeat(2001))).status).toBe(400);
    expect((await addComment(team.developer, 'c'.repeat(2000))).status).toBe(201);
  });

  it('requires tasks:write and membership', async () => {
    expect((await addComment(team.viewer, 'read only')).status).toBe(403);
    expect((await addComment(outsider, 'stranger')).status).toBe(403);
    expect((await http().post(commentsUrl()).send({ text: 'anon' })).status).toBe(401);
  });

  it('404s unknown, malformed and foreign task ids', async () => {
    expect((await addComment(team.developer, 'x', unknownId())).status).toBe(404);
    expect((await addComment(team.developer, 'x', 'not-an-id')).status).toBe(404);

    const other = await createWorkspace(outsider, 'Comment Elsewhere');
    const foreign = await createTask(outsider, other.slug);
    expect((await addComment(team.developer, 'x', foreign._id)).status).toBe(404);
  });
});

describe('comments: delete', () => {
  it('lets the author delete their own comment', async () => {
    const created = await addComment(team.developer, 'mine');
    const res = await removeComment(team.developer, created.body._id);
    expect(res.status).toBe(200);
    expect((await commentsOf()).map(c => c._id)).not.toContain(created.body._id);
    expect((await removeComment(team.developer, created.body._id)).status).toBe(404);
  });

  it('blocks another member without settings:manage, keeping the comment', async () => {
    const created = await addComment(team.developer, 'not yours to delete');
    const res = await removeComment(teamMember, created.body._id);
    expect(res.status).toBe(403);
    expect((await commentsOf()).map(c => c._id)).toContain(created.body._id);
  });

  it('lets a role with settings:manage delete anyone\'s comment', async () => {
    const created = await addComment(team.developer, 'moderated');
    expect((await removeComment(team.owner, created.body._id)).status).toBe(200);
    const second = await addComment(teamMember, 'moderated too');
    expect((await removeComment(team.productOwner, second.body._id)).status).toBe(200);
  });

  it('refuses a Viewer and non-members even for existing comments', async () => {
    const created = await addComment(team.developer, 'protected');
    expect((await removeComment(team.viewer, created.body._id)).status).toBe(403);
    expect((await removeComment(outsider, created.body._id)).status).toBe(403);
  });

  it('404s unknown comments and tasks, and does not cross tasks', async () => {
    expect((await removeComment(team.owner, unknownId())).status).toBe(404);
    expect((await removeComment(team.owner, unknownId(), unknownId())).status).toBe(404);
    expect((await removeComment(team.owner, unknownId(), 'not-an-id')).status).toBe(404);

    const created = await addComment(team.developer, 'stays on its own task');
    const other = await createTask(team.owner, slug, { title: 'Another task' });
    expect((await removeComment(team.owner, created.body._id, other._id)).status).toBe(404);
    expect((await commentsOf()).map(c => c._id)).toContain(created.body._id);
  });
});
