import http from 'http';
import type { AddressInfo } from 'net';
import { io as connectClient, type Socket } from 'socket.io-client';
import ChatMessage from '../models/chatMessageModel.js';
import { SOCKET_PATH, createChatServer } from '../realtime/socket.js';
import {
  bearer, createTeam, http as api, joinAs, registerUser, startApp, stopApp, unknownId, type TestUser,
} from './harness.js';

beforeAll(startApp);
afterAll(stopApp);

type Team = Awaited<ReturnType<typeof createTeam>>;
let team: Team;
let slug: string;
// A member of another workspace
let outsider: TestUser;
let outsiderSlug: string;

beforeAll(async () => {
  team = await createTeam();
  slug = team.workspace.slug;
  outsider = await registerUser('Otto Outsider');
  const created = await api().post('/api/workspaces').set(bearer(outsider.token)).send({ name: 'Elsewhere' });
  outsiderSlug = created.body.slug;
});

const base = (workspaceSlug = slug) => `/api/workspaces/${workspaceSlug}/chat`;
const get = (url: string, user: TestUser = team.owner) => api().get(url).set(bearer(user.token));
const post = (url: string, body: object, user: TestUser = team.owner) => api().post(url).set(bearer(user.token)).send(body);
const patch = (url: string, body: object, user: TestUser = team.owner) => api().patch(url).set(bearer(user.token)).send(body);
const del = (url: string, user: TestUser = team.owner) => api().delete(url).set(bearer(user.token));

interface Channel {
  _id: string; name: string; slug: string; type: string; unread: number; isDefault: boolean; private: boolean;
  members: { _id: string }[]; lastMessage: { text: string; author: { name: string } } | null;
}
interface Message {
  _id: string; channel: string; text: string; deleted: boolean; editedAt: string | null;
  author: { _id: string; name: string }; createdAt: string;
}

const channels = async (user: TestUser = team.owner): Promise<Channel[]> => (await get(`${base()}/channels`, user)).body.channels;
const generalOf = async (user: TestUser = team.owner): Promise<Channel> => (await channels(user)).find(channel => channel.isDefault)!;
const send = async (channelId: string, text: string, user: TestUser = team.owner): Promise<Message> => {
  const res = await post(`${base()}/channels/${channelId}/messages`, { text }, user);
  if (res.status !== 201) throw new Error(`send failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
};
const messagesUrl = (channelId: string, query = '') => `${base()}/channels/${channelId}/messages${query}`;

describe('channels', () => {
  it('creates #general on first list, once, for every member', async () => {
    const [first, second] = await Promise.all([channels(), channels(team.viewer)]);
    expect(first.filter(channel => channel.isDefault)).toHaveLength(1);
    expect(second.filter(channel => channel.isDefault)).toHaveLength(1);
    expect(first[0]).toMatchObject({ slug: 'general', type: 'team', unread: 0, lastMessage: null });
    expect(first[0]._id).toBe(second[0]._id);
    expect((await channels()).filter(channel => channel.isDefault)).toHaveLength(1);
  });

  it('lets a developer create team channels but not a viewer', async () => {
    const created = await post(`${base()}/channels`, { name: 'Design Team' }, team.developer);
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ name: 'Design Team', slug: 'design-team', type: 'team', private: false });

    const refused = await post(`${base()}/channels`, { name: 'Viewer room' }, team.viewer);
    expect(refused.status).toBe(403);

    // The viewer can still read the channel and post in it
    const visible = await channels(team.viewer);
    expect(visible.map(channel => channel.slug)).toContain('design-team');
    const posted = await post(messagesUrl(created.body._id), { text: 'hello from a viewer' }, team.viewer);
    expect(posted.status).toBe(201);
  });

  it('rejects duplicates, the reserved general name and invalid input', async () => {
    expect((await post(`${base()}/channels`, { name: 'design team' })).status).toBe(409);
    expect((await post(`${base()}/channels`, { name: 'General' })).status).toBe(409);
    expect((await post(`${base()}/channels`, { name: '' })).status).toBe(400);
    expect((await post(`${base()}/channels`, { name: 'x'.repeat(61) })).status).toBe(400);
    expect((await post(`${base()}/channels`, { name: { $gt: '' } })).status).toBe(400);
    expect((await post(`${base()}/channels`, { type: 'dm', name: 'sneaky' })).status).toBe(400);
    expect((await post(`${base()}/channels`, {})).status).toBe(400);
  });

  it('keeps private channels to their members', async () => {
    const created = await post(`${base()}/channels`, { name: 'Secret', private: true, members: [team.developer.id] });
    expect(created.status).toBe(201);
    expect(created.body.members.map((member: { _id: string }) => member._id).sort()).toEqual([team.owner.id, team.developer.id].sort());

    expect((await channels(team.developer)).map(channel => channel.slug)).toContain('secret');
    expect((await channels(team.viewer)).map(channel => channel.slug)).not.toContain('secret');
    expect((await get(messagesUrl(created.body._id), team.viewer)).status).toBe(404);
    expect((await post(messagesUrl(created.body._id), { text: 'let me in' }, team.viewer)).status).toBe(404);

    const outsiderMember = await post(`${base()}/channels`, { name: 'Bad members', private: true, members: [outsider.id] });
    expect(outsiderMember.status).toBe(400);
  });

  it('renames and archives only as the creator or a manager, never #general or DMs', async () => {
    const created = await post(`${base()}/channels`, { name: 'Ops' }, team.developer);
    const id = created.body._id;
    // A writer who is neither the creator nor a manager
    const colleague = await registerUser('Tina Teammate');
    await joinAs(team.workspace, team.owner, colleague, 'Team Member');
    expect((await patch(`${base()}/channels/${id}`, { name: 'Ops Room' }, colleague)).status).toBe(403);
    expect((await del(`${base()}/channels/${id}`, colleague)).status).toBe(403);
    expect((await patch(`${base()}/channels/${id}`, { name: 'Ops Room' }, team.viewer)).status).toBe(403);
    const renamed = await patch(`${base()}/channels/${id}`, { name: 'Ops Room' }, team.developer);
    expect(renamed.status).toBe(200);
    expect(renamed.body).toMatchObject({ name: 'Ops Room', slug: 'ops-room' });
    // The owner has settings:manage
    expect((await patch(`${base()}/channels/${id}`, { name: 'Operations' })).status).toBe(200);

    expect((await del(`${base()}/channels/${id}`, team.productOwner)).status).toBe(200);
    expect((await channels()).map(channel => channel.slug)).not.toContain('operations');
    expect((await del(`${base()}/channels/${id}`)).status).toBe(404);

    const general = await generalOf();
    expect((await del(`${base()}/channels/${general._id}`)).status).toBe(400);
    expect((await patch(`${base()}/channels/${general._id}`, { name: 'main' })).status).toBe(400);
  });

  it('opens a project channel on demand, idempotently', async () => {
    const project = await post(`/api/workspaces/${slug}/projects`, { name: 'Website Relaunch' });
    expect(project.status).toBe(201);

    const first = await post(`${base()}/channels`, { type: 'project', project: 'website relaunch' }, team.developer);
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({ type: 'project', name: 'Website Relaunch', project: 'Website Relaunch' });
    const again = await post(`${base()}/channels`, { type: 'project', project: 'Website Relaunch' }, team.productOwner);
    expect(again.status).toBe(200);
    expect(again.body._id).toBe(first.body._id);

    expect((await post(`${base()}/channels`, { type: 'project', project: 'No such project' })).status).toBe(404);
    expect((await post(`${base()}/channels`, { type: 'project', project: 'Website Relaunch' }, team.viewer)).status).toBe(403);
    expect((await channels(team.viewer)).map(channel => channel.type)).toContain('project');
  });
});

describe('direct messages', () => {
  it('is idempotent from both sides and private to the pair', async () => {
    const first = await post(`${base()}/dm`, { userId: team.developer.id });
    expect(first.status).toBe(201);
    expect(first.body.type).toBe('dm');
    expect(first.body.members.map((member: { _id: string }) => member._id).sort()).toEqual([team.owner.id, team.developer.id].sort());

    const again = await post(`${base()}/dm`, { userId: team.developer.id });
    expect(again.status).toBe(200);
    expect(again.body._id).toBe(first.body._id);
    const reverse = await post(`${base()}/dm`, { userId: team.owner.id }, team.developer);
    expect(reverse.status).toBe(200);
    expect(reverse.body._id).toBe(first.body._id);

    await send(first.body._id, 'just between us');
    expect((await get(messagesUrl(first.body._id), team.developer)).body.messages).toHaveLength(1);
    expect((await get(messagesUrl(first.body._id), team.viewer)).status).toBe(404);
    expect((await channels(team.viewer)).some(channel => channel.type === 'dm')).toBe(false);
  });

  it('refuses yourself, strangers and bad ids', async () => {
    expect((await post(`${base()}/dm`, { userId: team.owner.id })).status).toBe(400);
    expect((await post(`${base()}/dm`, { userId: outsider.id })).status).toBe(404);
    expect((await post(`${base()}/dm`, { userId: 'nope' })).status).toBe(400);
  });

  it('lets viewers message people', async () => {
    const res = await post(`${base()}/dm`, { userId: team.owner.id }, team.viewer);
    expect(res.status).toBe(201);
  });
});

describe('messages', () => {
  let channelId: string;

  beforeAll(async () => {
    const created = await post(`${base()}/channels`, { name: 'History' });
    channelId = created.body._id;
  });

  it('pages through history with before cursors, oldest first within a page', async () => {
    const start = Date.now() - 200 * 1000;
    await ChatMessage.insertMany(Array.from({ length: 120 }, (_, index) => ({
      workspace: team.workspace.id,
      channel: channelId,
      author: team.owner.id,
      text: `m${index}`,
      createdAt: new Date(start + index * 1000),
    })));

    const latest = await get(messagesUrl(channelId));
    expect(latest.status).toBe(200);
    expect(latest.headers['cache-control']).toBe('no-store');
    const page1: Message[] = latest.body.messages;
    expect(page1).toHaveLength(50);
    expect(page1[0].text).toBe('m70');
    expect(page1[49].text).toBe('m119');
    expect(latest.body.hasMore).toBe(true);

    const first = page1[0];
    const cursor = `${new Date(first.createdAt).getTime()}_${first._id}`;
    const older = await get(messagesUrl(channelId, `?before=${cursor}&limit=50`));
    expect(older.body.messages.map((message: Message) => message.text)).toEqual(Array.from({ length: 50 }, (_, index) => `m${20 + index}`));
    expect(older.body.hasMore).toBe(true);

    const oldest = older.body.messages[0];
    const last = await get(messagesUrl(channelId, `?before=${new Date(oldest.createdAt).getTime()}_${oldest._id}`));
    expect(last.body.messages).toHaveLength(20);
    expect(last.body.hasMore).toBe(false);

    expect((await get(messagesUrl(channelId, '?limit=5'))).body.messages).toHaveLength(5);
    expect((await get(messagesUrl(channelId, '?limit=500'))).status).toBe(400);
    expect((await get(messagesUrl(channelId, '?before=garbage'))).status).toBe(400);
  });

  it('returns only newer messages for the polling fallback, plus edits and deletions', async () => {
    const baseline = await get(messagesUrl(channelId, '?limit=1'));
    const newest: Message = baseline.body.messages[0];
    const cursor = `${new Date(newest.createdAt).getTime()}_${newest._id}`;
    const since = new Date().toISOString();

    const empty = await get(messagesUrl(channelId, `?after=${cursor}`));
    expect(empty.body.messages).toEqual([]);
    expect(empty.body.cursor).toBe(cursor);

    const added = await send(channelId, 'fresh one');
    const second = await send(channelId, 'fresh two', team.developer);
    const polled = await get(messagesUrl(channelId, `?after=${cursor}`), team.viewer);
    expect(polled.body.messages.map((message: Message) => message.text)).toEqual(['fresh one', 'fresh two']);
    expect(polled.body.hasMore).toBe(false);
    expect(polled.body.cursor).toBe(`${new Date(second.createdAt).getTime()}_${second._id}`);

    // Continuing from the returned cursor yields nothing new, so nothing is duplicated
    expect((await get(messagesUrl(channelId, `?after=${polled.body.cursor}`))).body.messages).toEqual([]);

    // Edits and deletions of older messages arrive through `changes`
    await patch(`${base()}/messages/${added._id}`, { text: 'fresh one (edited)' });
    await del(`${base()}/messages/${second._id}`, team.developer);
    const synced = await get(messagesUrl(channelId, `?after=${polled.body.cursor}&changedSince=${encodeURIComponent(since)}`));
    expect(synced.body.messages).toEqual([]);
    const changes: Message[] = synced.body.changes;
    expect(changes.find(change => change._id === added._id)).toMatchObject({ text: 'fresh one (edited)', deleted: false });
    expect(changes.find(change => change._id === second._id)).toMatchObject({ text: '', deleted: true });
  });

  it('validates the text and keeps it as plain text', async () => {
    expect((await post(messagesUrl(channelId), { text: '' })).status).toBe(400);
    expect((await post(messagesUrl(channelId), { text: '   ' })).status).toBe(400);
    expect((await post(messagesUrl(channelId), { text: 'x'.repeat(4001) })).status).toBe(400);
    expect((await post(messagesUrl(channelId), { text: { $gt: '' } })).status).toBe(400);
    expect((await post(messagesUrl(channelId), {})).status).toBe(400);
    expect((await post(messagesUrl(unknownId()), { text: 'hi' })).status).toBe(404);
    expect((await post(messagesUrl('not-an-id'), { text: 'hi' })).status).toBe(400);

    const max = await post(messagesUrl(channelId), { text: 'y'.repeat(4000) });
    expect(max.status).toBe(201);
    const html = await send(channelId, '<img src=x onerror=alert(1)> **not markdown**');
    expect(html.text).toBe('<img src=x onerror=alert(1)> **not markdown**');
  });

  it('lets people edit and delete only their own messages', async () => {
    const mine = await send(channelId, 'original');
    const edit = (id: string, text: string, user: TestUser) => patch(`${base()}/messages/${id}`, { text }, user);

    const others = await edit(mine._id, 'hijack', team.developer);
    expect(others.status).toBe(403);
    expect((await del(`${base()}/messages/${mine._id}`, team.developer)).status).toBe(403);
    expect((await edit(mine._id, '', team.owner)).status).toBe(400);

    const edited = await edit(mine._id, 'changed', team.owner);
    expect(edited.status).toBe(200);
    expect(edited.body).toMatchObject({ text: 'changed', deleted: false });
    expect(edited.body.editedAt).not.toBeNull();

    expect((await del(`${base()}/messages/${mine._id}`)).status).toBe(200);
    const listed = await get(messagesUrl(channelId, '?limit=100'));
    expect(listed.body.messages.map((message: Message) => message._id)).not.toContain(mine._id);
    // A deleted message is gone for good: no more edits or deletes
    expect((await edit(mine._id, 'back', team.owner)).status).toBe(404);
    expect((await del(`${base()}/messages/${mine._id}`)).status).toBe(404);
    const stored = await ChatMessage.findById(mine._id).lean();
    expect(stored?.text).toBe('');
    expect(stored?.deletedAt).toBeTruthy();
  });

  it('does not let messages be changed from another workspace', async () => {
    const mine = await send(channelId, 'workspace bound');
    expect((await patch(`${base(outsiderSlug)}/messages/${mine._id}`, { text: 'x' }, outsider)).status).toBe(404);
    expect((await del(`${base(outsiderSlug)}/messages/${mine._id}`, outsider)).status).toBe(404);
  });
});

describe('unread counts and read markers', () => {
  it('counts other people messages, resets on read and ignores your own', async () => {
    const created = await post(`${base()}/channels`, { name: 'Unread test' });
    const id = created.body._id;
    await send(id, 'two', team.developer);
    await send(id, 'one');
    await send(id, 'three');

    const developerView = (await channels(team.developer)).find(channel => channel._id === id)!;
    expect(developerView.unread).toBe(2);
    expect(developerView.lastMessage).toMatchObject({ text: 'three', author: { name: team.owner.name } });
    expect((await channels()).find(channel => channel._id === id)!.unread).toBe(0);

    const read = await post(`${base()}/channels/${id}/read`, {}, team.developer);
    expect(read.status).toBe(200);
    expect((await channels(team.developer)).find(channel => channel._id === id)!.unread).toBe(0);

    await send(id, 'four');
    expect((await channels(team.developer)).find(channel => channel._id === id)!.unread).toBe(1);
    expect((await get(`${base()}/channels`, team.developer)).body.unreadTotal).toBeGreaterThanOrEqual(1);
    expect((await post(`${base()}/channels/${unknownId()}/read`, {}, team.developer)).status).toBe(404);
  });
});

describe('mentions', () => {
  const bell = async (user: TestUser) => (await get('/api/notifications', user)).body.items as {
    type: string; summary: string; actor: { _id: string } | null; task: unknown; channel: { name: string; _id: string } | null;
  }[];

  it('notifies tagged members, never the sender, and only members of private channels', async () => {
    const general = await generalOf();
    await send(general._id, 'Heads up @Dan Developer and @Olivia Owner, also @Nobody Here');

    const forDan = (await bell(team.developer)).filter(item => item.type === 'chat.mention');
    expect(forDan).toHaveLength(1);
    expect(forDan[0]).toMatchObject({ actor: { _id: team.owner.id }, task: null, channel: { _id: general._id } });
    expect(forDan[0].summary).toContain('Heads up');
    expect((await bell(team.owner)).filter(item => item.type === 'chat.mention')).toHaveLength(0);
    expect((await bell(team.viewer)).filter(item => item.type === 'chat.mention')).toHaveLength(0);

    // Vera is not in the private channel, so tagging her tells her nothing
    const secret = await post(`${base()}/channels`, { name: 'Mentions secret', private: true, members: [team.developer.id] });
    await send(secret.body._id, '@Vera Viewer are you there? @Pat Product');
    expect((await bell(team.viewer)).filter(item => item.type === 'chat.mention')).toHaveLength(0);
    expect((await bell(team.productOwner)).filter(item => item.type === 'chat.mention')).toHaveLength(0);

    const stored = await ChatMessage.findOne({ channel: general._id, text: /Heads up/ }).lean();
    expect(stored?.mentions.map(String)).toEqual([team.developer.id]);
  });

  it('notifies only newly added mentions when a message is edited', async () => {
    const general = await generalOf();
    const message = await send(general._id, 'first draft for @Pat Product');
    const before = (await bell(team.productOwner)).filter(item => item.type === 'chat.mention').length;
    await patch(`${base()}/messages/${message._id}`, { text: 'first draft for @Pat Product and @Vera Viewer' });
    expect((await bell(team.productOwner)).filter(item => item.type === 'chat.mention')).toHaveLength(before);
    expect((await bell(team.viewer)).filter(item => item.type === 'chat.mention')).toHaveLength(1);
  });
});

describe('isolation', () => {
  it('keeps chat inside its workspace', async () => {
    const general = await generalOf();
    expect((await get(`${base()}/channels`, outsider)).status).toBe(403);
    expect((await post(`${base()}/dm`, { userId: team.owner.id }, outsider)).status).toBe(403);

    // A channel id from another workspace is simply not found
    expect((await get(messagesUrl(general._id).replace(slug, outsiderSlug), outsider)).status).toBe(404);
    expect((await post(messagesUrl(general._id).replace(slug, outsiderSlug), { text: 'intruder' }, outsider)).status).toBe(404);
    expect((await patch(`${base(outsiderSlug)}/channels/${general._id}`, { name: 'x' }, outsider)).status).toBe(404);
  });

  it('requires a signed-in user', async () => {
    expect((await api().get(`${base()}/channels`)).status).toBe(401);
  });

  it('lists members by name and avatar only, even for a viewer without users:read', async () => {
    const res = await get(`${base()}/members`, team.viewer);
    expect(res.status).toBe(200);
    const members: { _id: string; name: string; email?: string }[] = res.body.members;
    expect(members.map(member => member._id)).toEqual(expect.arrayContaining([team.owner.id, team.viewer.id, team.developer.id, team.productOwner.id]));
    expect(members.map(member => member._id)).not.toContain(outsider.id);
    expect(Object.keys(members[0]).sort()).toEqual(['_id', 'avatarUrl', 'name']);
    expect((await get(`${base(outsiderSlug)}/members`, team.viewer)).status).toBe(403);
  });

  it('lists who is online (nobody without a socket)', async () => {
    const res = await get(`${base()}/presence`);
    expect(res.status).toBe(200);
    expect(res.body.online).toEqual([]);
  });
});

// ----------------------------------------------------------------
// Socket.IO
// ----------------------------------------------------------------
describe('socket server', () => {
  let server: http.Server;
  let url: string;
  const open: Socket[] = [];

  beforeAll(async () => {
    server = http.createServer();
    createChatServer(server, { ready: async () => undefined, sweepIntervalMs: 60_000 });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    open.forEach(socket => socket.close());
    // io.close() closes the http server too
    await new Promise<void>(resolve => {
      server.close(() => resolve());
      server.closeAllConnections();
    });
  });

  afterEach(() => {
    open.splice(0).forEach(socket => socket.close());
  });

  const client = (token: unknown): Socket => {
    const socket = connectClient(url, { path: SOCKET_PATH, addTrailingSlash: false, transports: ['websocket'], auth: { token }, reconnection: false, forceNew: true });
    open.push(socket);
    return socket;
  };
  const connected = (user: TestUser): Promise<Socket> => new Promise((resolve, reject) => {
    const socket = client(user.token);
    // chat:ready: the server has put the socket into its rooms
    socket.once('chat:ready', () => resolve(socket));
    socket.once('connect_error', error => reject(error));
  });
  const next = <T>(socket: Socket, event: string, timeoutMs = 5000): Promise<T> => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out waiting for ${event}`)), timeoutMs);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
  const ask = <T = { ok: boolean; [key: string]: unknown }>(socket: Socket, event: string, payload: unknown): Promise<T> =>
    new Promise(resolve => socket.emit(event, payload, resolve));

  it('refuses connections without a valid session token', async () => {
    const rejected = (token: unknown) => new Promise<string>(resolve => {
      const socket = client(token);
      socket.once('connect_error', error => resolve(error.message));
      socket.once('connect', () => resolve('connected'));
    });
    expect(await rejected(undefined)).toBe('unauthorized');
    expect(await rejected('')).toBe('unauthorized');
    expect(await rejected('not.a.jwt')).toBe('unauthorized');
    expect(await rejected('tm_0123456789abcdef0123456789abcdef')).toBe('unauthorized');
    expect(await rejected({ $gt: '' })).toBe('unauthorized');
  });

  it('refuses a session that was signed out', async () => {
    const extra = await api().post('/api/auth/login').send({ email: team.viewer.email, password: team.viewer.password });
    expect(extra.status).toBe(200);
    const out = await api().post('/api/auth/logout').set(bearer(extra.body.token));
    expect([200, 204]).toContain(out.status);
    const verdict = await new Promise<string>(resolve => {
      const socket = client(extra.body.token);
      socket.once('connect_error', error => resolve(error.message));
      socket.once('connect', () => resolve('connected'));
    });
    expect(verdict).toBe('unauthorized');
  });

  it('broadcasts a REST message to another client in the channel room, once', async () => {
    const general = await generalOf();
    const [owner, developer] = await Promise.all([connected(team.owner), connected(team.developer)]);
    expect((await ask(owner, 'chat:join', { channelId: general._id })).ok).toBe(true);
    expect((await ask(developer, 'chat:join', { channelId: general._id })).ok).toBe(true);

    const received: Message[] = [];
    developer.on('chat:message', (message: Message) => received.push(message));
    const arrival = next<Message>(developer, 'chat:message');
    const posted = await send(general._id, 'live hello');
    expect(await arrival).toMatchObject({ _id: posted._id, text: 'live hello', channel: general._id, author: { name: team.owner.name } });

    const updated = next<Message>(developer, 'chat:message_updated');
    await patch(`${base()}/messages/${posted._id}`, { text: 'live hello!' });
    expect(await updated).toMatchObject({ _id: posted._id, text: 'live hello!' });

    const removed = next<{ _id: string }>(developer, 'chat:message_deleted');
    await del(`${base()}/messages/${posted._id}`);
    expect((await removed)._id).toBe(posted._id);
    expect(received).toHaveLength(1);
  });

  it('keeps channels private to their members and sends activity to the workspace', async () => {
    const general = await generalOf();
    const secret = (await post(`${base()}/channels`, { name: 'Socket secret', private: true, members: [team.developer.id] })).body;
    const [viewer, developer] = await Promise.all([connected(team.viewer), connected(team.developer)]);

    expect((await ask(viewer, 'chat:join', { channelId: secret._id })).ok).toBe(false);
    expect((await ask(developer, 'chat:join', { channelId: secret._id })).ok).toBe(true);
    expect((await ask(viewer, 'chat:join', { channelId: 'nope' })).ok).toBe(false);
    expect((await ask(viewer, 'chat:join', 'a string')).ok).toBe(false);

    const privateLeak = jest.fn();
    viewer.on('chat:message', privateLeak);
    viewer.on('chat:activity', privateLeak);
    const activity = next<{ channelId: string; preview: string }>(viewer, 'chat:activity');
    await send(general._id, 'public news');
    expect(await activity).toMatchObject({ channelId: general._id, preview: 'public news' });

    const toDeveloper = next<Message>(developer, 'chat:message');
    await send(secret._id, 'only for Dan');
    expect((await toDeveloper).text).toBe('only for Dan');
    await new Promise(resolve => setTimeout(resolve, 150));
    expect(privateLeak.mock.calls.every(([payload]) => payload.channelId !== secret._id && payload.channel !== secret._id)).toBe(true);
  });

  it('relays typing only between joined clients, throttled', async () => {
    const general = await generalOf();
    const [owner, developer, viewer] = await Promise.all([connected(team.owner), connected(team.developer), connected(team.viewer)]);
    await ask(owner, 'chat:join', { channelId: general._id });
    await ask(developer, 'chat:join', { channelId: general._id });

    const typing = jest.fn();
    developer.on('chat:typing', typing);
    const outsiderHears = jest.fn();
    viewer.on('chat:typing', outsiderHears);
    const heard = next<{ channelId: string; user: { _id: string; name: string } }>(developer, 'chat:typing');
    owner.emit('chat:typing', { channelId: general._id });
    owner.emit('chat:typing', { channelId: general._id });
    expect(await heard).toEqual({ channelId: general._id, user: { _id: team.owner.id, name: team.owner.name } });
    // A client that never joined cannot type into the channel
    viewer.emit('chat:typing', { channelId: general._id });
    await new Promise(resolve => setTimeout(resolve, 150));
    expect(typing).toHaveBeenCalledTimes(1);
    expect(outsiderHears).not.toHaveBeenCalled();
  });

  it('sends through the socket with an ack and limits a burst to 10 messages per 10 seconds', async () => {
    const created = (await post(`${base()}/channels`, { name: 'Burst' })).body;
    const sender = await connected(team.productOwner);
    const listener = await connected(team.developer);
    await ask(listener, 'chat:join', { channelId: created._id });

    const arrival = next<Message>(listener, 'chat:message');
    const first = await ask<{ ok: boolean; message: Message }>(sender, 'chat:send', { channelId: created._id, text: 'via socket' });
    expect(first.ok).toBe(true);
    expect((await arrival).text).toBe('via socket');
    expect((await get(messagesUrl(created._id))).body.messages.map((message: Message) => message.text)).toContain('via socket');

    const results = [first];
    for (let i = 0; i < 10; i += 1) {
      results.push(await ask<{ ok: boolean; message: Message }>(sender, 'chat:send', { channelId: created._id, text: `burst ${i}` }));
    }
    expect(results.filter(result => result.ok)).toHaveLength(10);
    expect(results.at(-1)).toMatchObject({ ok: false, error: 'rate_limited' });

    expect(await ask(sender, 'chat:send', { channelId: 'nope', text: 'x' })).toMatchObject({ ok: false });
  });

  it('reports presence to the workspace and to the REST endpoint', async () => {
    const watcher = await connected(team.owner);
    const update = next<{ userId: string; online: boolean }>(watcher, 'presence:update');
    const dev = await connected(team.developer);
    expect(await update).toMatchObject({ userId: expect.any(String), online: true });

    const online = (await get(`${base()}/presence`)).body.online as string[];
    expect(online).toEqual(expect.arrayContaining([team.owner.id, team.developer.id]));

    const offline = new Promise<{ userId: string; online: boolean }>(resolve => {
      watcher.on('presence:update', (payload: { userId: string; online: boolean }) => {
        if (payload.userId === team.developer.id && !payload.online) resolve(payload);
      });
    });
    dev.close();
    expect(await offline).toMatchObject({ userId: team.developer.id, online: false });
  });
});

