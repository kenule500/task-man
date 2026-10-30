import http_ from 'http';
import type { AddressInfo } from 'net';
import {
  bearer, createTask, createTeam, http, registerUser, startApp, stopApp, unknownId, type TestUser,
} from './harness.js';
import { verifySignature } from '../utils/webhooks/payload.js';
import { sendWebhookRequest } from '../utils/webhooks/deliver.js';

interface Received { headers: http_.IncomingHttpHeaders; raw: string; json: any }

let receiver: http_.Server;
let receiverUrl: string;
let received: Received[] = [];
// How the receiver answers; tests change it to simulate failures
let respondWith = 200;
let redirectTo: string | null = null;

beforeAll(async () => {
  await startApp();
  receiver = http_.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      let json: unknown = null;
      try { json = JSON.parse(raw); } catch { /* keep null */ }
      received.push({ headers: req.headers, raw, json });
      if (redirectTo) {
        res.writeHead(302, { Location: redirectTo });
        res.end();
        return;
      }
      res.writeHead(respondWith, { 'Content-Type': 'text/plain' });
      res.end('received');
    });
  });
  await new Promise<void>(resolve => receiver.listen(0, '127.0.0.1', resolve));
  receiverUrl = `http://127.0.0.1:${(receiver.address() as AddressInfo).port}/hook`;
});

afterAll(async () => {
  await new Promise<void>(resolve => receiver.close(() => resolve()));
  await stopApp();
});

let team: Awaited<ReturnType<typeof createTeam>>;
let slug: string;
let outsider: TestUser;

beforeAll(async () => {
  team = await createTeam();
  slug = team.workspace.slug;
  outsider = await registerUser('Nina Notmember');
});

beforeEach(() => {
  received = [];
  respondWith = 200;
  redirectTo = null;
});

const url = (path = '') => `/api/workspaces/${slug}/webhooks${path}`;
const create = (user: TestUser, body: Record<string, unknown> = {}) =>
  http().post(url()).set(bearer(user.token)).send({ name: 'Receiver', url: receiverUrl, events: ['*'], ...body });
const makeHook = async (body: Record<string, unknown> = {}) => {
  const res = await create(team.owner, body);
  if (res.status !== 201) throw new Error(`create webhook failed: ${res.status} ${JSON.stringify(res.body)}`);
  // The webhook.created event reaches the new webhook itself; tests start from a clean slate
  received = [];
  return res.body as { _id: string; secret: string; [key: string]: any };
};
const deliveries = async (id: string) => (await http().get(url(`/${id}/deliveries`)).set(bearer(team.owner.token))).body as any[];
const removeAll = async () => {
  const hooks = (await http().get(url()).set(bearer(team.owner.token))).body as { _id: string }[];
  for (const hook of hooks) await http().delete(url(`/${hook._id}`)).set(bearer(team.owner.token));
};

afterEach(removeAll);

describe('webhooks: access', () => {
  it('is for settings managers only', async () => {
    expect((await http().get(url())).status).toBe(401);
    expect((await http().get(url()).set(bearer(outsider.token))).status).toBe(403);
    for (const user of [team.viewer, team.developer]) {
      expect((await http().get(url()).set(bearer(user.token))).status).toBe(403);
      expect((await create(user)).status).toBe(403);
    }
    expect((await create(team.productOwner)).status).toBe(201);
  });

  it('refuses personal API tokens', async () => {
    const token = (await http().post(`/api/workspaces/${slug}/tokens`).set(bearer(team.owner.token))
      .send({ name: 'admin', scopes: ['settings:manage', 'tasks:read'] })).body.token as string;
    expect((await http().get(url()).set(bearer(token))).status).toBe(403);
    expect((await http().post(url()).set(bearer(token)).send({ name: 'x', url: receiverUrl })).status).toBe(403);
  });
});

describe('webhooks: create and manage', () => {
  it('returns the secret once and hides it afterwards', async () => {
    const created = await create(team.owner);
    expect(created.status).toBe(201);
    expect(created.body.secret).toMatch(/^whsec_[A-Za-z0-9_-]{32}$/);
    expect(created.body).toMatchObject({ name: 'Receiver', url: receiverUrl, events: ['*'], active: true, failureCount: 0 });

    const listed = await http().get(url()).set(bearer(team.owner.token));
    expect(listed.body).toHaveLength(1);
    expect(JSON.stringify(listed.body)).not.toContain(created.body.secret);
    expect(listed.body[0].secret).toBeUndefined();
  });

  it('validates name, url and events', async () => {
    expect((await create(team.owner, { name: '' })).status).toBe(400);
    expect((await create(team.owner, { url: 'nope' })).status).toBe(400);
    expect((await create(team.owner, { url: 'ftp://example.com/x' })).status).toBe(400);
    expect((await create(team.owner, { url: 'http://user:pw@127.0.0.1:1/x' })).status).toBe(400);
    expect((await create(team.owner, { events: [] })).status).toBe(400);
    expect((await create(team.owner, { events: ['nope.event'] })).status).toBe(400);
    expect((await create(team.owner, { events: [{ $ne: 1 }] })).status).toBe(400);
  });

  it('collapses * with other events and allows at most 10 webhooks', async () => {
    const hook = await makeHook({ events: ['task.created', '*'] });
    expect(hook.events).toEqual(['*']);
    for (let i = 0; i < 9; i += 1) await makeHook({ name: `h${i}` });
    expect((await create(team.owner, { name: 'eleventh' })).status).toBe(400);
  });

  it('updates, rotates the secret and deletes', async () => {
    const hook = await makeHook();
    const patched = await http().patch(url(`/${hook._id}`)).set(bearer(team.owner.token))
      .send({ name: 'Renamed', events: ['task.created'], active: false });
    expect(patched.status).toBe(200);
    expect(patched.body).toMatchObject({ name: 'Renamed', events: ['task.created'], active: false });
    expect(patched.body.secret).toBeUndefined();

    const rotated = await http().post(url(`/${hook._id}/rotate-secret`)).set(bearer(team.owner.token));
    expect(rotated.status).toBe(200);
    expect(rotated.body.secret).toMatch(/^whsec_/);
    expect(rotated.body.secret).not.toBe(hook.secret);

    expect((await http().delete(url(`/${hook._id}`)).set(bearer(team.owner.token))).status).toBe(200);
    expect((await http().patch(url(`/${hook._id}`)).set(bearer(team.owner.token)).send({ name: 'x' })).status).toBe(404);
    expect((await http().patch(url('/not-an-id')).set(bearer(team.owner.token)).send({ name: 'x' })).status).toBe(404);
    expect((await http().delete(url(`/${unknownId()}`)).set(bearer(team.owner.token))).status).toBe(404);
  });

  it('records webhook.created, updated and deleted', async () => {
    const hook = await makeHook({ name: 'Audited hook' });
    await http().patch(url(`/${hook._id}`)).set(bearer(team.owner.token)).send({ active: false });
    await http().delete(url(`/${hook._id}`)).set(bearer(team.owner.token));
    const log = await http().get(`/api/workspaces/${slug}/activity?area=webhook`).set(bearer(team.owner.token));
    const text = JSON.stringify(log.body);
    for (const action of ['webhook.created', 'webhook.updated', 'webhook.deleted']) expect(text).toContain(action);
    expect(text).not.toContain(hook.secret);
  });

  it('does not touch webhooks of another workspace', async () => {
    const hook = await makeHook();
    const otherOwner = await registerUser('Otto Other');
    const other = await http().post('/api/workspaces').set(bearer(otherOwner.token)).send({ name: 'Other WS' });
    const res = await http().patch(`/api/workspaces/${other.body.slug}/webhooks/${hook._id}`)
      .set(bearer(otherOwner.token)).send({ name: 'hijack' });
    expect(res.status).toBe(404);
  });
});

describe('webhooks: delivery', () => {
  it('sends a signed event that the receiver can verify', async () => {
    const hook = await makeHook();
    const task = await createTask(team.owner, slug, { title: 'Signed task' });

    const hit = received.find(item => item.json?.event === 'task.created');
    expect(hit).toBeDefined();
    expect(hit!.headers['content-type']).toBe('application/json');
    expect(hit!.headers['user-agent']).toBe('TaskMan-Webhooks/1');
    expect(hit!.headers['x-taskman-event']).toBe('task.created');
    expect(hit!.headers['x-taskman-delivery']).toBe(hit!.json.id);
    expect(verifySignature(hook.secret, hit!.raw, String(hit!.headers['x-taskman-signature']))).toBe(true);
    expect(verifySignature('whsec_wrong', hit!.raw, String(hit!.headers['x-taskman-signature']))).toBe(false);
    expect(hit!.json).toMatchObject({
      event: 'task.created',
      workspace: { slug },
      actor: { name: 'Olivia Owner' },
      task: { id: task._id, title: 'Signed task', status: 'pending' },
    });
    expect(hit!.json.task.url).toContain(`/${slug}/tasks?task=${task._id}`);
    expect(JSON.stringify(hit!.json)).not.toContain(hook.secret);
  });

  it('logs deliveries without the secret', async () => {
    const hook = await makeHook();
    await createTask(team.owner, slug, { title: 'Logged task' });
    const log = await deliveries(hook._id);
    expect(log.length).toBeGreaterThan(0);
    expect(log[0]).toMatchObject({ event: 'task.created', status: 'success', responseStatus: 200, attempt: 1 });
    expect(typeof log[0].durationMs).toBe('number');
    expect(JSON.stringify(log)).not.toContain(hook.secret);
    expect((await http().get(url('')).set(bearer(team.owner.token))).body[0].lastDeliveryAt).not.toBeNull();
  });

  it('only sends the subscribed events and skips inactive webhooks', async () => {
    const hook = await makeHook({ events: ['task.deleted'] });
    const task = await createTask(team.owner, slug, { title: 'Filtered' });
    await http().put(`/api/workspaces/${slug}/tasks/${task._id}`).set(bearer(team.owner.token)).send({ title: 'Filtered 2' });
    expect(received).toHaveLength(0);

    await http().delete(`/api/workspaces/${slug}/tasks/${task._id}`).set(bearer(team.owner.token));
    expect(received.map(item => item.json.event)).toEqual(['task.deleted']);

    received = [];
    await http().patch(url(`/${hook._id}`)).set(bearer(team.owner.token)).send({ events: ['*'], active: false });
    await createTask(team.owner, slug, { title: 'Nobody listens' });
    expect(received).toHaveLength(0);
  });

  it('sends a ping from the test button', async () => {
    const hook = await makeHook({ events: ['task.deleted'] });
    const res = await http().post(url(`/${hook._id}/test`)).set(bearer(team.owner.token));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ event: 'ping', status: 'success', responseStatus: 200 });
    expect(received).toHaveLength(1);
    expect(received[0].json).toMatchObject({ event: 'ping', workspace: { slug } });
    expect(verifySignature(hook.secret, received[0].raw, String(received[0].headers['x-taskman-signature']))).toBe(true);
  });

  it('records failures, does not follow redirects and never breaks the request', async () => {
    const hook = await makeHook();
    respondWith = 500;
    const created = await http().post(`/api/workspaces/${slug}/tasks`).set(bearer(team.owner.token))
      .send({ title: 'Receiver is down', deadline: '2030-06-15' });
    expect(created.status).toBe(201);
    let log = await deliveries(hook._id);
    expect(log[0]).toMatchObject({ status: 'failed', responseStatus: 500 });
    expect((await http().get(url()).set(bearer(team.owner.token))).body[0].failureCount).toBeGreaterThan(0);

    received = [];
    redirectTo = 'http://127.0.0.1:1/elsewhere';
    const ping = await http().post(url(`/${hook._id}/test`)).set(bearer(team.owner.token));
    expect(ping.body).toMatchObject({ status: 'failed', responseStatus: 302 });
    expect(received).toHaveLength(1);

    redirectTo = null;
    respondWith = 200;
    await http().post(url(`/${hook._id}/test`)).set(bearer(team.owner.token));
    expect((await http().get(url()).set(bearer(team.owner.token))).body[0].failureCount).toBe(0);
    log = await deliveries(hook._id);
    expect(log.length).toBeGreaterThanOrEqual(3);
  });

  it('reports an unreachable receiver as a failed delivery', async () => {
    const result = await sendWebhookRequest(
      { url: 'http://127.0.0.1:1/none', secret: 'whsec_x', event: 'ping', deliveryId: 'd', body: '{}' },
      { production: false, timeoutMs: 2000 },
    );
    expect(result.ok).toBe(false);
    expect(result.responseStatus).toBeNull();
    expect(result.error.length).toBeGreaterThan(0);
  });

  it('redelivers the same body and delivery id with the next attempt number', async () => {
    const hook = await makeHook();
    await http().post(url(`/${hook._id}/test`)).set(bearer(team.owner.token));
    const [first] = await deliveries(hook._id);
    const original = received[0];
    received = [];

    const again = await http().post(url(`/${hook._id}/deliveries/${first.deliveryId}/redeliver`)).set(bearer(team.owner.token));
    expect(again.status).toBe(200);
    expect(again.body).toMatchObject({ deliveryId: first.deliveryId, attempt: 2, status: 'success' });
    expect(received).toHaveLength(1);
    expect(received[0].raw).toBe(original.raw);
    expect(received[0].headers['x-taskman-delivery']).toBe(first.deliveryId);

    expect((await http().post(url(`/${hook._id}/deliveries/${unknownId()}/redeliver`)).set(bearer(team.owner.token))).status).toBe(404);
    expect((await http().post(url(`/${hook._id}/deliveries/00000000-0000-4000-8000-000000000000/redeliver`)).set(bearer(team.owner.token))).status).toBe(404);
  });

  it('switches a webhook off after 20 consecutive failures', async () => {
    const hook = await makeHook();
    respondWith = 500;
    for (let i = 0; i < 20; i += 1) await http().post(url(`/${hook._id}/test`)).set(bearer(team.owner.token));
    const after = (await http().get(url()).set(bearer(team.owner.token))).body[0];
    expect(after.failureCount).toBe(20);
    expect(after.active).toBe(false);

    received = [];
    await createTask(team.owner, slug, { title: 'After auto-disable' });
    expect(received).toHaveLength(0);

    const reenabled = await http().patch(url(`/${hook._id}`)).set(bearer(team.owner.token)).send({ active: true });
    expect(reenabled.body).toMatchObject({ active: true, failureCount: 0 });
  });
});

describe('webhooks: SSRF guard', () => {
  it('rejects private targets when the guard runs in production mode', async () => {
    for (const target of ['https://127.0.0.1/hook', 'https://10.0.0.1/hook', 'https://169.254.169.254/latest', 'https://[::1]/hook', 'http://example.com/hook']) {
      const result = await sendWebhookRequest(
        { url: target, secret: 'whsec_x', event: 'ping', deliveryId: 'd', body: '{}' },
        { production: true, timeoutMs: 1000 },
      );
      expect(result.ok).toBe(false);
      expect(result.responseStatus).toBeNull();
    }
    expect(received).toHaveLength(0);
  });

  it('blocks a host that resolves to a loopback address in production mode', async () => {
    const result = await sendWebhookRequest(
      { url: 'https://localhost/hook', secret: 'whsec_x', event: 'ping', deliveryId: 'd', body: '{}' },
      { production: true, timeoutMs: 1000 },
    );
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/not allowed|private|reserved/);
  });
});
