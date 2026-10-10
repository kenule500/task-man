import crypto from 'crypto';
import {
  bearer, createTask, createTeam, http, startApp, stopApp, tasksUrl, type TestUser,
} from './harness.js';
import { signBody } from '../utils/githubEvents.js';

beforeAll(startApp);
afterAll(stopApp);

let team: Awaited<ReturnType<typeof createTeam>>;
let slug: string;
let secret: string;
let webTask: { _id: string; number: number };
let plainTask: { _id: string; number: number };

const settingsUrl = (suffix = '') => `/api/workspaces/${slug}/integrations/github${suffix}`;
const hookUrl = (workspaceSlug = slug) => `/api/integrations/github/${workspaceSlug}`;

/** Sends a signed delivery exactly as GitHub does: the signature covers the raw JSON bytes. */
const deliver = (event: string, payload: unknown, options: { secret?: string; workspaceSlug?: string; signature?: string } = {}) => {
  const body = JSON.stringify(payload);
  return http()
    .post(hookUrl(options.workspaceSlug))
    .set('Content-Type', 'application/json')
    .set('X-GitHub-Event', event)
    .set('X-Hub-Signature-256', options.signature ?? signBody(options.secret ?? secret, body))
    .send(body);
};

interface TaskView {
  _id: string; status: string; completedAt?: string; links?: { kind: string; url: string; state?: string; title: string }[];
}
const getTask = async (user: TestUser, id: string, workspaceSlug = slug): Promise<TaskView> => {
  const res = await http().get(tasksUrl(workspaceSlug)).set(bearer(user.token));
  return (res.body as TaskView[]).find(task => task._id === id)!;
};

const prPayload = (action: string, number: number, taskNumber: number, prefix = 'WEB', extra: Record<string, unknown> = {}) => ({
  action,
  repository: { full_name: 'acme/app' },
  pull_request: {
    number,
    title: `${prefix}-${taskNumber}: add login`,
    body: '',
    html_url: `https://github.com/acme/app/pull/${number}`,
    state: 'open',
    merged: false,
    head: { ref: 'feature/login', sha: 'abc1234def5678' },
    user: { login: 'ada' },
    ...extra,
  },
});

beforeAll(async () => {
  team = await createTeam();
  slug = team.workspace.slug;
  const project = await http().post(`/api/workspaces/${slug}/projects`).set(bearer(team.owner.token)).send({ name: 'Web Site', key: 'WEB' });
  if (project.status !== 201) throw new Error(`project failed: ${project.status} ${JSON.stringify(project.body)}`);
  webTask = await createTask(team.owner, slug, { title: 'Build the login', project: 'Web Site' }) as typeof webTask;
  plainTask = await createTask(team.owner, slug, { title: 'No project task' }) as typeof plainTask;
});

describe('github settings API', () => {
  it('is disabled by default and needs settings:manage', async () => {
    const res = await http().get(settingsUrl()).set(bearer(team.owner.token));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ enabled: false, autoTransition: true, connectedAt: null });
    expect(res.body.secret).toBeUndefined();
    expect(res.body.webhookUrl).toMatch(new RegExp(`^https?://[^/]+${hookUrl()}$`));

    for (const user of [team.viewer, team.developer]) {
      expect((await http().get(settingsUrl()).set(bearer(user.token))).status).toBe(403);
      expect((await http().post(settingsUrl('/enable')).set(bearer(user.token))).status).toBe(403);
      expect((await http().post(settingsUrl('/regenerate-secret')).set(bearer(user.token))).status).toBe(403);
      expect((await http().patch(settingsUrl()).set(bearer(user.token)).send({ autoTransition: false })).status).toBe(403);
      expect((await http().post(settingsUrl('/disable')).set(bearer(user.token))).status).toBe(403);
    }
    expect((await http().get(settingsUrl())).status).toBe(401);
  });

  it('refuses to regenerate while disabled', async () => {
    expect((await http().post(settingsUrl('/regenerate-secret')).set(bearer(team.owner.token))).status).toBe(409);
  });

  it('enables with a random 32-byte secret, keeps it on repeat and never leaks it to other members', async () => {
    const res = await http().post(settingsUrl('/enable')).set(bearer(team.owner.token));
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.enabled).toBe(true);
    expect(res.body.secret).toMatch(/^[a-f0-9]{64}$/);
    expect(res.body.connectedAt).toEqual(expect.any(String));
    secret = res.body.secret;

    const again = await http().post(settingsUrl('/enable')).set(bearer(team.owner.token));
    expect(again.body.secret).toBe(secret);

    // The workspace document other members can read never carries the secret
    const workspace = await http().get(`/api/workspaces/${slug}`).set(bearer(team.developer.token));
    expect(JSON.stringify(workspace.body)).not.toContain(secret);
  });

  it('regenerates the secret and validates the auto-transition switch', async () => {
    const regenerated = await http().post(settingsUrl('/regenerate-secret')).set(bearer(team.owner.token));
    expect(regenerated.status).toBe(200);
    expect(regenerated.body.secret).toMatch(/^[a-f0-9]{64}$/);
    expect(regenerated.body.secret).not.toBe(secret);
    // The old secret stops working at once
    const stale = await deliver('ping', { zen: 'x' }, { secret });
    expect(stale.status).toBe(401);
    secret = regenerated.body.secret;

    expect((await http().patch(settingsUrl()).set(bearer(team.owner.token)).send({ autoTransition: 'yes' })).status).toBe(400);
    expect((await http().patch(settingsUrl()).set(bearer(team.owner.token)).send({})).status).toBe(400);
    const off = await http().patch(settingsUrl()).set(bearer(team.owner.token)).send({ autoTransition: false });
    expect(off.body.autoTransition).toBe(false);
    const on = await http().patch(settingsUrl()).set(bearer(team.owner.token)).send({ autoTransition: true });
    expect(on.body.autoTransition).toBe(true);
  });

  it('records the changes in the audit log without the secret', async () => {
    const log = await http().get(`/api/workspaces/${slug}/activity?area=integration`).set(bearer(team.owner.token));
    expect(log.status).toBe(200);
    expect(log.body.items.length).toBeGreaterThanOrEqual(3);
    expect(JSON.stringify(log.body)).not.toContain(secret);
  });
});

describe('github webhook: authentication', () => {
  it('answers ping with 200 when signed', async () => {
    const res = await deliver('ping', { zen: 'Keep it logically awesome.' });
    expect(res.status).toBe(200);
  });

  it('rejects a wrong, malformed or missing signature with 401', async () => {
    expect((await deliver('ping', {}, { secret: 'f'.repeat(64) })).status).toBe(401);
    expect((await deliver('ping', {}, { signature: 'sha256=abcd' })).status).toBe(401);
    expect((await deliver('ping', {}, { signature: 'nonsense' })).status).toBe(401);
    const unsigned = await http().post(hookUrl()).set('Content-Type', 'application/json').set('X-GitHub-Event', 'ping').send('{}');
    expect(unsigned.status).toBe(401);
  });

  it('rejects a body that was changed after signing', async () => {
    const signature = signBody(secret, JSON.stringify({ a: 1 }));
    expect((await deliver('ping', { a: 2 }, { signature })).status).toBe(401);
  });

  it('answers unknown workspaces and malformed slugs with the same 404', async () => {
    const unknown = await deliver('ping', {}, { workspaceSlug: 'no-such-workspace' });
    const weird = await deliver('ping', {}, { workspaceSlug: 'UPPER%24ne' });
    expect(unknown.status).toBe(404);
    expect(weird.status).toBe(404);
    expect(weird.body).toEqual(unknown.body);
  });

  it('rejects a JSON body that is not signed JSON', async () => {
    const body = '{not json';
    const res = await http().post(hookUrl()).set('Content-Type', 'application/json').set('X-GitHub-Event', 'push')
      .set('X-Hub-Signature-256', signBody(secret, body)).send(body);
    expect(res.status).toBe(400);
  });

  it('ignores events it does not handle with 202', async () => {
    expect((await deliver('issues', { action: 'opened' })).status).toBe(202);
    expect((await deliver('pull_request', { action: 'labeled', repository: { full_name: 'acme/app' } })).status).toBe(202);
  });
});

describe('github webhook: linking and transitions', () => {
  it('links a pull request to the task, moves it to in-progress and refreshes on edits', async () => {
    const opened = await deliver('pull_request', prPayload('opened', 7, webTask.number));
    expect(opened.status).toBe(200);

    let task = await getTask(team.owner, webTask._id);
    expect(task.status).toBe('in-progress');
    expect(task.links).toEqual([expect.objectContaining({
      provider: 'github', kind: 'pull_request', state: 'open', number: 7, repo: 'acme/app', url: 'https://github.com/acme/app/pull/7', author: 'ada',
    })]);

    // Same url again: refreshed, not duplicated
    await deliver('pull_request', prPayload('edited', 7, webTask.number, 'WEB', { title: `WEB-${webTask.number}: add login form` }));
    task = await getTask(team.owner, webTask._id);
    expect(task.links).toHaveLength(1);
    expect(task.links![0].title).toBe(`WEB-${webTask.number}: add login form`);
  });

  it('records the status change in the audit log without an actor', async () => {
    const log = await http().get(`/api/workspaces/${slug}/activity?area=task`).set(bearer(team.owner.token));
    const entry = log.body.items.find((item: { task?: string; summary: string }) => item.summary.includes('(via GitHub)'));
    expect(entry).toBeDefined();
    expect(entry.actor ?? null).toBeNull();
    expect(entry.changes).toEqual([expect.objectContaining({ field: 'status', from: 'pending', to: 'in-progress' })]);
  });

  it('completes the task when the pull request is merged and never lets a late open event undo it', async () => {
    const merged = await deliver('pull_request', prPayload('closed', 7, webTask.number, 'WEB', { state: 'closed', merged: true }));
    expect(merged.status).toBe(200);
    let task = await getTask(team.owner, webTask._id);
    expect(task.status).toBe('completed');
    expect(task.completedAt).toBeDefined();
    expect(task.links![0].state).toBe('merged');

    await deliver('pull_request', prPayload('reopened', 7, webTask.number));
    await deliver('pull_request', prPayload('synchronize', 7, webTask.number));
    task = await getTask(team.owner, webTask._id);
    expect(task.status).toBe('completed');
    expect(task.links![0].state).toBe('merged');
  });

  it('does not match a key whose project prefix is wrong, and falls back to TM without a project', async () => {
    const wrong = await deliver('pull_request', prPayload('opened', 8, plainTask.number, 'WEB'));
    expect(wrong.status).toBe(202);
    expect((await getTask(team.owner, plainTask._id)).links).toEqual([]);

    const right = await deliver('pull_request', prPayload('opened', 8, plainTask.number, 'TM'));
    expect(right.status).toBe(200);
    const task = await getTask(team.owner, plainTask._id);
    expect(task.status).toBe('in-progress');
    expect(task.links).toHaveLength(1);
  });

  it('links branches and commits from pushes and created branches', async () => {
    const sha = 'c'.repeat(40);
    const pushed = await deliver('push', {
      ref: `refs/heads/feature/web-${webTask.number}-polish`,
      repository: { full_name: 'acme/app' },
      pusher: { name: 'ada' },
      commits: [
        { id: sha, message: `WEB-${webTask.number} polish the form\n\nbody`, url: `https://github.com/acme/app/commit/${sha}`, author: { username: 'ada' } },
        { id: 'd'.repeat(40), message: 'unrelated', url: `https://github.com/acme/app/commit/${'d'.repeat(40)}` },
      ],
    });
    expect(pushed.status).toBe(200);
    await deliver('create', { ref_type: 'branch', ref: `web-${webTask.number}-hotfix`, repository: { full_name: 'acme/app' }, sender: { login: 'ada' } });

    const task = await getTask(team.owner, webTask._id);
    const kinds = task.links!.map(link => link.kind).sort();
    expect(kinds).toEqual(['branch', 'branch', 'commit', 'pull_request']);
    expect(task.links!.find(link => link.kind === 'commit')).toMatchObject({ title: 'WEB-' + webTask.number + ' polish the form' });
    // A completed task stays completed after more pushes
    expect(task.status).toBe('completed');
  });

  it('leaves tasks alone when auto-transition is off, but still links', async () => {
    const task = await createTask(team.owner, slug, { title: 'Manual flow', project: 'Web Site' });
    await http().patch(settingsUrl()).set(bearer(team.owner.token)).send({ autoTransition: false });
    await deliver('pull_request', prPayload('opened', 20, task.number));
    const after = await getTask(team.owner, task._id);
    expect(after.status).toBe('pending');
    expect(after.links).toHaveLength(1);
    await http().patch(settingsUrl()).set(bearer(team.owner.token)).send({ autoTransition: true });
  });

  it('ignores keys of tasks in another workspace', async () => {
    const other = await createTeam();
    const foreign = await createTask(other.owner, other.workspace.slug, { title: 'Elsewhere' });
    const res = await deliver('pull_request', prPayload('opened', 30, 999, 'TM'));
    expect(res.status).toBe(202);
    expect((await getTask(other.owner, foreign._id, other.workspace.slug)).links ?? []).toEqual([]);
  });

  it('caps links per task at 50', async () => {
    const task = await createTask(team.owner, slug, { title: 'Busy task', project: 'Web Site' });
    for (let batch = 0; batch < 3; batch += 1) {
      const commits = Array.from({ length: 20 }, (_, index) => {
        const sha = crypto.createHash('sha1').update(`${batch}-${index}`).digest('hex');
        return { id: sha, message: `WEB-${task.number} step ${batch}-${index}`, url: `https://github.com/acme/app/commit/${sha}` };
      });
      await deliver('push', { ref: 'refs/heads/main', repository: { full_name: 'acme/app' }, commits });
    }
    expect((await getTask(team.owner, task._id)).links).toHaveLength(50);
  });

  it('disabling forgets the secret and turns the webhook off', async () => {
    const disabled = await http().post(settingsUrl('/disable')).set(bearer(team.owner.token));
    expect(disabled.body).toMatchObject({ enabled: false, connectedAt: null });
    expect(disabled.body.secret).toBeUndefined();
    expect((await deliver('ping', {})).status).toBe(404);
  });
});
