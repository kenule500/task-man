import mongoose from 'mongoose';
import Activity from '../models/activityModel.js';
import {
  bearer, createTask, createTeam, createWorkspace, http, registerUser, startApp, stopApp, tasksUrl, unknownId, type TestUser,
} from './harness.js';

beforeAll(startApp);
afterAll(stopApp);

type Team = Awaited<ReturnType<typeof createTeam>>;
let team: Team;
let slug: string;
// Not a member of `team`'s workspace (one login: the sign-in limiter is shared by the whole file)
let outsider: TestUser;

beforeAll(async () => {
  team = await createTeam();
  slug = team.workspace.slug;
  outsider = await registerUser('Otto Outsider');
});

const changesUrl = (workspaceSlug = slug) => `/api/workspaces/${workspaceSlug}/changes`;
const get = (url: string, user: TestUser = team.owner) => http().get(url).set(bearer(user.token));
const feed = (since?: string, user: TestUser = team.owner, workspaceSlug = slug) =>
  get(`${changesUrl(workspaceSlug)}${since ? `?since=${encodeURIComponent(since)}` : ''}`, user);

type Change = { id: string; action: string; task?: string; summary: string; actor: { _id: string; name: string } | null };

describe('change feed', () => {
  it('starts from the newest cursor and then returns only what is new, in order', async () => {
    const start = await feed();
    expect(start.status).toBe(200);
    expect(start.headers['cache-control']).toBe('no-store');
    expect(start.body.changes).toEqual([]);
    expect(start.body.cursor).toMatch(/^\d+_[a-f0-9]{24}$/);

    const first = await createTask(team.owner, slug, { title: 'Feed one' });
    await http().patch(`${tasksUrl(slug)}/${first._id}`).set(bearer(team.developer.token)).send({ status: 'in-progress' });

    const res = await feed(start.body.cursor, team.viewer);
    expect(res.status).toBe(200);
    const changes: Change[] = res.body.changes;
    expect(changes.map(change => change.action)).toEqual(['task.created', 'task.updated']);
    expect(changes[0]).toMatchObject({ task: first._id, summary: 'Feed one', actor: { _id: team.owner.id, name: team.owner.name } });
    expect(changes[1].actor).toMatchObject({ _id: team.developer.id });
    expect(res.body.changes[1].fields).toEqual(expect.arrayContaining([{ field: 'status', from: 'pending', to: 'in-progress' }]));
    expect(res.body.reset).toBeUndefined();

    // Nothing new: same cursor back, no entries
    const again = await feed(res.body.cursor);
    expect(again.body).toEqual({ cursor: res.body.cursor, changes: [] });

    // Paging continues from the cursor without repeating or skipping
    await createTask(team.owner, slug, { title: 'Feed two' });
    const next = await feed(res.body.cursor);
    expect(next.body.changes.map((change: Change) => change.summary)).toEqual(['Feed two']);
  });

  it('accepts an ISO date as the starting point', async () => {
    const before = new Date(Date.now() - 1000).toISOString();
    await createTask(team.owner, slug, { title: 'Since a date' });
    const res = await feed(before);
    expect(res.status).toBe(200);
    expect(res.body.changes.map((change: Change) => change.summary)).toContain('Since a date');
  });

  it('breaks ties between entries created in the same millisecond by id', async () => {
    const at = new Date();
    const [a, b, c] = await Activity.insertMany([1, 2, 3].map(n => ({
      workspace: team.workspace.id, actor: team.owner.id, action: 'task.updated', summary: `Tie ${n}`, createdAt: at,
    })));
    const sorted = [a, b, c].map(entry => String(entry._id)).sort();
    const cursor = `${at.getTime()}_${sorted[0]}`;
    const res = await feed(cursor);
    expect(res.body.changes.map((change: Change) => change.id)).toEqual(sorted.slice(1));
  });

  it('rejects malformed cursors', async () => {
    for (const since of ['yesterday', '123_nothex', '{"$gt":""}', 'x'.repeat(60)]) {
      expect((await feed(since)).status).toBe(400);
    }
    // Operator injection through the query string is a string-typed validation error, not a query
    const injected = await get(`${changesUrl()}?since[$gt]=0`);
    expect([200, 400]).toContain(injected.status);
  });

  it('asks the client to reload when more than 200 entries are waiting', async () => {
    // Its own workspace: the entries below are dated a moment ahead so they sort after the starting cursor
    const crowd = { owner: team.owner, workspace: await createWorkspace(team.owner, 'Crowd') };
    const crowdSlug = crowd.workspace.slug;
    const crowdFeed = (since?: string) => feed(since, crowd.owner, crowdSlug);
    const bulk = (label: string, count: number, base: number) => Activity.insertMany(Array.from({ length: count }, (_, i) => ({
      workspace: crowd.workspace.id, actor: crowd.owner.id, action: 'task.updated', summary: `${label} ${i}`,
      createdAt: new Date(base + i),
    })));

    const start = await crowdFeed();
    const base = Date.now() + 5;
    await bulk('Bulk', 201, base);

    const res = await crowdFeed(start.body.cursor);
    expect(res.status).toBe(200);
    expect(res.body.reset).toBe(true);
    expect(res.body.changes).toEqual([]);

    // The new cursor is the newest entry, so the next poll is quiet again
    const quiet = await crowdFeed(res.body.cursor);
    expect(quiet.body.changes).toEqual([]);
    expect(quiet.body.reset).toBeUndefined();

    // Exactly 200 is still replayed, in order
    await bulk('Edge', 200, base + 1000);
    const edge = await crowdFeed(res.body.cursor);
    expect(edge.body.reset).toBeUndefined();
    expect(edge.body.changes).toHaveLength(200);
    expect(edge.body.changes[0].summary).toBe('Edge 0');
    expect(edge.body.changes[199].summary).toBe('Edge 199');
  });

  it('hides audit-only entries from members without settings:manage', async () => {
    const start = await feed();
    await Activity.insertMany(['audit.exported', 'token.created', 'webhook.created'].map(action => ({
      workspace: team.workspace.id, actor: team.owner.id, action, summary: `Secret ${action}`,
    })));
    await createTask(team.owner, slug, { title: 'Visible to all' });

    const ownerSees = (await feed(start.body.cursor, team.owner)).body.changes.map((change: Change) => change.action);
    expect(ownerSees).toEqual(['audit.exported', 'token.created', 'webhook.created', 'task.created']);

    for (const member of [team.developer, team.viewer]) {
      const res = await feed(start.body.cursor, member);
      expect(res.body.changes.map((change: Change) => change.action)).toEqual(['task.created']);
      expect(JSON.stringify(res.body)).not.toContain('Secret');
    }

    // The starting cursor of a member never points at an entry they cannot see
    await Activity.create({ workspace: team.workspace.id, actor: team.owner.id, action: 'webhook.deleted', summary: 'Secret last' });
    const memberStart = await feed(undefined, team.developer);
    const ownerStart = await feed(undefined, team.owner);
    expect(memberStart.body.cursor).toBe((await feed(start.body.cursor, team.developer)).body.cursor);
    expect(ownerStart.body.cursor).not.toBe(memberStart.body.cursor);
  });

  it('never leaks another workspace and rejects non-members', async () => {
    const other = { owner: team.owner, workspace: await createWorkspace(team.owner, 'Other') };
    const otherSlug = other.workspace.slug;
    const start = await feed();
    const otherStart = await feed(undefined, other.owner, otherSlug);

    await createTask(other.owner, otherSlug, { title: 'Other workspace secret' });
    await createTask(team.owner, slug, { title: 'Mine' });

    const mine = await feed(start.body.cursor);
    expect(mine.body.changes.map((change: Change) => change.summary)).toEqual(['Mine']);
    const theirs = await feed(otherStart.body.cursor, other.owner, otherSlug);
    expect(theirs.body.changes.map((change: Change) => change.summary)).toEqual(['Other workspace secret']);

    expect((await feed(start.body.cursor, outsider)).status).toBe(403);
    expect((await get(changesUrl()).unset('Authorization')).status).toBe(401);
  });
});

describe('presence', () => {
  const presenceUrl = (query = '') => `${changesUrl()}/presence${query}`;
  const beat = (taskId: unknown, user: TestUser = team.owner) =>
    http().post(presenceUrl()).set(bearer(user.token)).send({ taskId });

  it('lists the other people who have a task open and forgets them when they leave', async () => {
    const task = await createTask(team.owner, slug, { title: 'Watched' });
    expect((await beat(task._id, team.owner)).status).toBe(204);
    expect((await beat(task._id, team.developer)).status).toBe(204);
    expect((await beat(task._id, team.developer)).status).toBe(204);

    const asOwner = await get(presenceUrl(`?task=${task._id}`));
    expect(asOwner.status).toBe(200);
    expect(asOwner.body.viewers).toEqual([expect.objectContaining({ _id: team.developer.id, name: team.developer.name })]);
    expect(asOwner.body.viewers[0].email).toBeUndefined();

    const asViewer = await get(presenceUrl(`?task=${task._id}`), team.viewer);
    expect(asViewer.body.viewers.map((viewer: { _id: string }) => viewer._id).sort())
      .toEqual([team.developer.id, team.owner.id].sort());

    const left = await http().delete(presenceUrl(`?task=${task._id}`)).set(bearer(team.developer.token));
    expect(left.status).toBe(204);
    expect((await get(presenceUrl(`?task=${task._id}`))).body.viewers).toEqual([]);
  });

  it('ignores stale heartbeats, unknown tasks and other workspaces', async () => {
    const task = await createTask(team.owner, slug, { title: 'Stale' });
    await beat(task._id, team.developer);
    await mongoose.connection.collection('presences').updateMany(
      { task: new mongoose.Types.ObjectId(task._id) },
      { $set: { seenAt: new Date(Date.now() - 5 * 60 * 1000) } },
    );
    expect((await get(presenceUrl(`?task=${task._id}`))).body.viewers).toEqual([]);

    expect((await beat(unknownId())).status).toBe(404);
    expect((await beat('not-an-id')).status).toBe(400);
    expect((await get(presenceUrl('?task=not-an-id'))).status).toBe(400);

    const other = { owner: team.owner, workspace: await createWorkspace(team.owner, 'Elsewhere') };
    expect((await beat(task._id, outsider)).status).toBe(403);
    const foreign = await createTask(other.owner, other.workspace.slug, { title: 'Foreign' });
    expect((await beat(foreign._id)).status).toBe(404);
  });
});
