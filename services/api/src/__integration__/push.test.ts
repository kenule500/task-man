import webpush from 'web-push';
import PushSubscription from '../models/pushSubscriptionModel.js';
import {
  bearer, createTask, createTeam, http, registerUser, startApp, stopApp, type TestUser,
} from './harness.js';

jest.mock('web-push', () => ({ __esModule: true, default: { sendNotification: jest.fn() } }));

const send = webpush.sendNotification as jest.Mock;
const VAPID = {
  VAPID_PUBLIC_KEY: 'BPublicKeyForTestsOnly',
  VAPID_PRIVATE_KEY: 'private-key-for-tests-only',
  VAPID_SUBJECT: 'mailto:ops@example.com',
};
const saved: Record<string, string | undefined> = {};

const enablePush = () => Object.entries(VAPID).forEach(([key, value]) => { process.env[key] = value; });
const disablePush = () => Object.keys(VAPID).forEach(key => { delete process.env[key]; });

beforeAll(async () => {
  Object.keys(VAPID).forEach(key => { saved[key] = process.env[key]; });
  disablePush();
  await startApp();
});
afterAll(async () => {
  Object.entries(saved).forEach(([key, value]) => {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  });
  await stopApp();
});
beforeEach(() => { send.mockReset(); send.mockResolvedValue({}); });

const subscription = (endpoint: string) => ({ endpoint, keys: { p256dh: 'BKeyP256dh_-abc123', auth: 'authSecret_-123' } });
const publicKey = (user: TestUser) => http().get('/api/notifications/push/public-key').set(bearer(user.token));
const subscribe = (user: TestUser, body: unknown) =>
  http().post('/api/notifications/push/subscribe').set(bearer(user.token)).send(body as object);
const unsubscribe = (user: TestUser, endpoint: unknown) =>
  http().post('/api/notifications/push/unsubscribe').set(bearer(user.token)).send({ endpoint });

describe('push: disabled without VAPID keys', () => {
  let user: TestUser;
  beforeAll(async () => { user = await registerUser('Pia Push'); });

  it('requires a session', async () => {
    expect((await http().get('/api/notifications/push/public-key')).status).toBe(401);
    expect((await http().post('/api/notifications/push/subscribe').send({})).status).toBe(401);
    expect((await http().post('/api/notifications/push/unsubscribe').send({})).status).toBe(401);
  });

  it('reports push as disabled and refuses subscriptions', async () => {
    disablePush();
    const key = await publicKey(user);
    expect(key.status).toBe(200);
    expect(key.body).toEqual({ publicKey: null, enabled: false });
    expect((await subscribe(user, subscription('https://push.example/off'))).status).toBe(503);
    expect(await PushSubscription.countDocuments({ endpoint: 'https://push.example/off' })).toBe(0);
  });
});

describe('push: subscriptions', () => {
  let ann: TestUser;
  let ben: TestUser;
  beforeAll(async () => {
    enablePush();
    ann = await registerUser('Ann Alpha');
    ben = await registerUser('Ben Beta');
  });
  beforeEach(enablePush);

  it('shares only the public key', async () => {
    const res = await publicKey(ann);
    expect(res.body).toEqual({ publicKey: VAPID.VAPID_PUBLIC_KEY, enabled: true });
    expect(JSON.stringify(res.body)).not.toContain(VAPID.VAPID_PRIVATE_KEY);
  });

  it('stores a subscription once per endpoint (upsert)', async () => {
    const endpoint = 'https://push.example/ann-1';
    expect((await subscribe(ann, subscription(endpoint))).status).toBe(201);
    expect((await subscribe(ann, subscription(endpoint))).status).toBe(201);
    expect(await PushSubscription.countDocuments({ endpoint })).toBe(1);
  });

  it('rejects invalid endpoints and keys', async () => {
    expect((await subscribe(ann, subscription('http://push.example/insecure'))).status).toBe(400);
    expect((await subscribe(ann, subscription('not a url'))).status).toBe(400);
    expect((await subscribe(ann, subscription(`https://push.example/${'x'.repeat(2100)}`))).status).toBe(400);
    expect((await subscribe(ann, { endpoint: 'https://push.example/k', keys: { p256dh: 'bad key!', auth: 'ok' } })).status).toBe(400);
    expect((await subscribe(ann, { endpoint: 'https://push.example/k', keys: { p256dh: 'a'.repeat(201), auth: 'ok' } })).status).toBe(400);
    expect((await subscribe(ann, { endpoint: 'https://push.example/k' })).status).toBe(400);
    expect((await subscribe(ann, {})).status).toBe(400);
  });

  it('moves an endpoint to whoever subscribes last, so a shared browser never notifies the previous account', async () => {
    const endpoint = 'https://push.example/shared-browser';
    await subscribe(ann, subscription(endpoint));
    await subscribe(ben, subscription(endpoint));
    const stored = await PushSubscription.find({ endpoint });
    expect(stored).toHaveLength(1);
    expect(String(stored[0].user)).toBe(ben.id);
  });

  it('only removes the caller\'s own subscription', async () => {
    const endpoint = 'https://push.example/ann-own';
    await subscribe(ann, subscription(endpoint));

    expect((await unsubscribe(ben, endpoint)).status).toBe(200);
    expect(await PushSubscription.countDocuments({ endpoint })).toBe(1);

    const res = await unsubscribe(ann, endpoint);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ subscribed: false });
    expect(await PushSubscription.countDocuments({ endpoint })).toBe(0);
    // Idempotent
    expect((await unsubscribe(ann, endpoint)).status).toBe(200);
    expect((await unsubscribe(ann, 'ftp://nope')).status).toBe(400);
  });

  it('keeps the push preference as a boolean flag on the profile', async () => {
    const off = await http().put('/api/profile/notifications').set(bearer(ann.token)).send({ push: false });
    expect(off.status).toBe(200);
    expect(off.body.notifications.push).toBe(false);
    expect((await http().put('/api/profile/notifications').set(bearer(ann.token)).send({ push: 'no' })).status).toBe(400);
    await http().put('/api/profile/notifications').set(bearer(ann.token)).send({ push: true });
  });
});

describe('push: delivery on notification', () => {
  let team: Awaited<ReturnType<typeof createTeam>>;
  const endpoint = 'https://push.example/developer-phone';

  beforeAll(async () => {
    enablePush();
    team = await createTeam();
  });
  beforeEach(enablePush);

  it('pushes to the assignee only, and stops when they switch push off', async () => {
    await subscribe(team.developer, subscription(endpoint));
    const slug = team.workspace.slug;

    const task = await createTask(team.owner, slug, { title: 'Push me', assignees: [team.developer.id] });
    expect(send).toHaveBeenCalledTimes(1);
    const [target, body] = send.mock.calls[0];
    expect(target.endpoint).toBe(endpoint);
    const payload = JSON.parse(body);
    expect(payload).toMatchObject({
      title: 'TaskMan',
      body: 'Olivia Owner assigned you "Push me"',
      url: `/${slug}/tasks?task=${task._id}`,
    });
    expect(payload.tag).toMatch(/^[a-f0-9]{24}$/);

    await http().put('/api/profile/notifications').set(bearer(team.developer.token)).send({ push: false });
    send.mockClear();
    await createTask(team.owner, slug, { title: 'Quiet one', assignees: [team.developer.id] });
    expect(send).not.toHaveBeenCalled();
  });

  it('forgets a device the push service says is gone', async () => {
    await http().put('/api/profile/notifications').set(bearer(team.developer.token)).send({ push: true });
    send.mockRejectedValue(Object.assign(new Error('Gone'), { statusCode: 410 }));
    await createTask(team.owner, team.workspace.slug, { title: 'Gone device', assignees: [team.developer.id] });
    expect(await PushSubscription.countDocuments({ endpoint })).toBe(0);
  });

  it('sends nothing without VAPID keys', async () => {
    await subscribe(team.developer, subscription(endpoint)).catch(() => undefined);
    disablePush();
    await createTask(team.owner, team.workspace.slug, { title: 'No keys', assignees: [team.developer.id] });
    expect(send).not.toHaveBeenCalled();
  });
});
