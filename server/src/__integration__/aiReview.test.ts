import mongoose from 'mongoose';
import {
  bearer, createTask, createTeam, http, registerUser, startApp, stopApp, tasksUrl, unknownId, type TestUser,
} from './harness.js';
import { signBody } from '../utils/githubEvents.js';
import { decryptSecret } from '../utils/secretBox.js';
import { reviewWithModel } from '../utils/ai/provider.js';

// The model provider is replaced: no request ever leaves for Alibaba Cloud. GitHub is replaced with a fetch spy.
jest.mock('../utils/ai/provider.js', () => ({ __esModule: true, reviewWithModel: jest.fn() }));

beforeAll(startApp);
afterAll(stopApp);

const provider = reviewWithModel as unknown as jest.Mock;
const GITHUB_TOKEN = 'ghp_abcdefghijklmnopqrstuvwxyz0123456789';

let team: Awaited<ReturnType<typeof createTeam>>;
let other: Awaited<ReturnType<typeof createTeam>>;
let outsider: TestUser;
let slug: string;
let secret: string;
let webTask: { _id: string; number: number };
let plainTask: { _id: string; number: number };

const aiUrl = () => `/api/workspaces/${slug}/ai`;
const runUrl = (id = webTask._id, workspaceSlug = slug) => `${tasksUrl(workspaceSlug)}/${id}/ai-review`;
const listUrl = (id = webTask._id, workspaceSlug = slug) => `${tasksUrl(workspaceSlug)}/${id}/ai-reviews`;
const run = (user: TestUser, body: Record<string, unknown> = {}, id = webTask._id) =>
  http().post(runUrl(id)).set(bearer(user.token)).send(body);
const settings = (user: TestUser) => http().get(aiUrl()).set(bearer(user.token));
const patchSettings = (user: TestUser | { token: string }, body: Record<string, unknown>) =>
  http().patch(aiUrl()).set(bearer(user.token)).send(body);

// ----------------------------------------------------------------
// GitHub fake
// ----------------------------------------------------------------
interface FakeFile { filename: string; status?: string; additions?: number; deletions?: number; patch?: string }
let pullFiles: FakeFile[] = [];
let githubStatus = 200;
let pullHeadSha = 'sha-one';
const githubCalls: { url: string; authorization: string | null }[] = [];
const realFetch = global.fetch;

const fakeGithub = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
  const url = String(input instanceof Request ? input.url : input);
  if (!url.startsWith('https://api.github.com/')) return realFetch(input, init);
  const headers = new Headers(init?.headers);
  githubCalls.push({ url, authorization: headers.get('authorization') });
  if (githubStatus !== 200) return new Response('{"message":"nope"}', { status: githubStatus });
  const path = new URL(url).pathname;
  if (path.endsWith('/files')) {
    const page = Number(new URL(url).searchParams.get('page') ?? '1');
    const files = page === 1 ? pullFiles : [];
    return new Response(JSON.stringify(files.map(file => ({ status: 'modified', additions: 3, deletions: 1, ...file }))), { status: 200 });
  }
  const number = Number(path.split('/').pop());
  return new Response(JSON.stringify({
    number, title: `WEB: add login #${number}`, body: 'Implements the login form.', changed_files: pullFiles.length,
    head: { sha: pullHeadSha, ref: 'feature/login' }, base: { ref: 'main' },
  }), { status: 200 });
};

// ----------------------------------------------------------------
// Model fake
// ----------------------------------------------------------------
interface Answer { verdict?: string; summary?: string; criteria?: unknown[]; issues?: unknown[] }
const answer = (overrides: Answer = {}) => ({
  output: {
    verdict: 'match',
    summary: 'The pull request implements the login form.',
    criteria: [
      { index: 1, status: 'met', evidence: [{ file: 'src/login.ts', note: 'form submits to /api/login' }], explanation: 'Implemented.' },
      { index: 2, status: 'met', evidence: [{ file: 'src/login.ts', note: 'error message rendered' }], explanation: 'Shown.' },
    ],
    issues: [{ severity: 'low', category: 'tests', file: 'src/login.ts', line: 4, message: 'No test for the empty password case.' }],
    ...overrides,
  },
  model: 'qwen-test',
  usage: { inputTokens: 1200, outputTokens: 300 },
});

let release: (() => void) | null = null;
const holdProvider = () => {
  provider.mockImplementationOnce(() => new Promise(resolve => { release = () => resolve(answer()); }));
};

// ----------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------
interface ReviewView {
  _id: string; status: string; verdict: string | null; summary: string; error: string; truncated: boolean; omittedFiles: string[];
  counts: { met: number; partial: number; missing: number; issues: number }; model: string; usage: { inputTokens: number; outputTokens: number };
  criteria?: { text: string; status: string; evidence: { file: string; note: string }[] }[]; issues?: { severity: string; file: string }[];
  pr: { repo: string; number: number; url: string; headSha: string }; requestedBy: { name: string } | null;
}

const waitForReview = async (user: TestUser, id: string, taskId = webTask._id): Promise<ReviewView> => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const res = await http().get(`${listUrl(taskId)}/${id}`).set(bearer(user.token));
    if (res.body.status === 'completed' || res.body.status === 'failed') return res.body as ReviewView;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('review did not finish');
};

const runAndWait = async (user: TestUser, body: Record<string, unknown> = {}, taskId = webTask._id) => {
  const queued = await run(user, body, taskId);
  if (queued.status !== 202) throw new Error(`run failed: ${queued.status} ${JSON.stringify(queued.body)}`);
  return waitForReview(user, queued.body._id, taskId);
};

const deliver = (event: string, payload: unknown) => {
  const body = JSON.stringify(payload);
  return http()
    .post(`/api/integrations/github/${slug}`)
    .set('Content-Type', 'application/json')
    .set('X-GitHub-Event', event)
    .set('X-Hub-Signature-256', signBody(secret, body))
    .send(body);
};

const prPayload = (action: string, number: number, taskNumber: number, sha: string, extra: Record<string, unknown> = {}) => ({
  action,
  repository: { full_name: 'acme/app' },
  pull_request: {
    number, title: `WEB-${taskNumber}: add login`, body: '', html_url: `https://github.com/acme/app/pull/${number}`,
    state: 'open', merged: false, draft: false, head: { ref: 'feature/login', sha }, user: { login: 'ada' }, ...extra,
  },
});

const reviewCount = async (taskId: string) =>
  mongoose.connection.collection('aireviews').countDocuments({ task: new mongoose.Types.ObjectId(taskId) });

beforeAll(async () => {
  process.env.DASHSCOPE_API_KEY = 'sk-test-never-logged';
  delete process.env.DASHSCOPE_MODEL;
  delete process.env.AI_REVIEW_DAILY_LIMIT;
  delete process.env.AI_REVIEW_MAX_DIFF_CHARS;
  jest.spyOn(global, 'fetch').mockImplementation(fakeGithub as typeof fetch);

  team = await createTeam();
  other = await createTeam();
  outsider = await registerUser('Nina Notmember');
  slug = team.workspace.slug;

  const project = await http().post(`/api/workspaces/${slug}/projects`).set(bearer(team.owner.token)).send({ name: 'Web Site', key: 'WEB' });
  if (project.status !== 201) throw new Error(`project failed: ${project.status}`);
  webTask = await createTask(team.owner, slug, {
    title: 'Build the login', project: 'Web Site', description: 'Users sign in with email and password.',
    acceptanceCriteria: [{ text: 'A user can sign in with email and password' }, { text: 'A wrong password shows an error message' }],
  }) as typeof webTask;
  plainTask = await createTask(team.owner, slug, { title: 'No pull request here' }) as typeof plainTask;

  const enabled = await http().post(`/api/workspaces/${slug}/integrations/github/enable`).set(bearer(team.owner.token));
  secret = enabled.body.secret;
  expect((await deliver('pull_request', prPayload('edited', 7, webTask.number, 'sha-one'))).status).toBe(200);
});

afterAll(() => {
  delete process.env.DASHSCOPE_API_KEY;
  jest.restoreAllMocks();
});

beforeEach(() => {
  provider.mockReset();
  provider.mockImplementation(async () => answer());
  pullFiles = [{ filename: 'src/login.ts', patch: '@@ -0,0 +1,3 @@\n+export const login = () => 1;' }, { filename: 'README.md', patch: '@@ -1 +1 @@\n+docs' }];
  githubStatus = 200;
  pullHeadSha = 'sha-one';
  githubCalls.length = 0;
  release = null;
});

// ================================================================
describe('acceptance criteria on tasks', () => {
  it('are stored in order with ids and shown in the task activity', async () => {
    const task = await createTask(team.owner, slug, { title: 'With criteria', acceptanceCriteria: [{ text: '  First  ' }, { text: 'Second' }] });
    expect(task.acceptanceCriteria.map((item: { text: string }) => item.text)).toEqual(['First', 'Second']);
    expect(task.acceptanceCriteria[0]._id).toMatch(/^[a-f0-9]{24}$/);

    const kept = task.acceptanceCriteria[1];
    const updated = await http().patch(`${tasksUrl(slug)}/${task._id}`).set(bearer(team.owner.token))
      .send({ acceptanceCriteria: [{ _id: kept._id, text: 'Second, reworded' }, { text: 'Third' }] });
    expect(updated.status).toBe(200);
    expect(updated.body.acceptanceCriteria.map((item: { text: string }) => item.text)).toEqual(['Second, reworded', 'Third']);
    expect(updated.body.acceptanceCriteria[0]._id).toBe(kept._id);

    const activity = await http().get(`${tasksUrl(slug)}/${task._id}/activity`).set(bearer(team.owner.token));
    const change = activity.body.items.flatMap((item: { changes: { field: string; from?: string; to?: string }[] }) => item.changes)
      .find((entry: { field: string }) => entry.field === 'acceptanceCriteria');
    expect(change).toMatchObject({ from: '2', to: '2' });

    const cleared = await http().patch(`${tasksUrl(slug)}/${task._id}`).set(bearer(team.owner.token)).send({ acceptanceCriteria: [] });
    expect(cleared.body.acceptanceCriteria).toEqual([]);
  });

  it('are validated: text 1..300, at most 30, plain objects', async () => {
    const bad = async (acceptanceCriteria: unknown) =>
      (await http().post(tasksUrl(slug)).set(bearer(team.owner.token)).send({ title: 'x', deadline: '2030-01-01', acceptanceCriteria })).status;
    expect(await bad([{ text: '' }])).toBe(400);
    expect(await bad([{ text: '   ' }])).toBe(400);
    expect(await bad([{ text: 'x'.repeat(301) }])).toBe(400);
    expect(await bad(Array.from({ length: 31 }, () => ({ text: 'a' })))).toBe(400);
    expect(await bad('nope')).toBe(400);
    expect(await bad(['plain string'])).toBe(400);
    expect(await bad([{ _id: 'not-an-id', text: 'a' }])).toBe(400);
    expect(await bad(Array.from({ length: 30 }, () => ({ text: 'a' })))).toBe(201);
  });
});

// ================================================================
describe('AI settings', () => {
  it('shows availability to anyone who can read tasks, and never a key or token', async () => {
    const res = await settings(team.viewer);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      available: true, enabled: false, autoReview: false, model: 'qwen-plus', dailyLimit: 50, usedToday: 0, githubTokenSet: false,
    });
    expect(JSON.stringify(res.body)).not.toContain('sk-test');
    expect((await http().get(aiUrl())).status).toBe(401);
    expect((await settings(outsider)).status).toBeGreaterThanOrEqual(403);
  });

  it('reports the feature as unavailable when the server has no API key', async () => {
    delete process.env.DASHSCOPE_API_KEY;
    expect((await settings(team.owner)).body.available).toBe(false);
    process.env.DASHSCOPE_API_KEY = 'sk-test-never-logged';
  });

  it('can only be changed with settings:manage, never through an API token', async () => {
    for (const user of [team.viewer, team.developer]) {
      expect((await patchSettings(user, { enabled: true })).status).toBe(403);
    }
    const token = await http().post(`/api/workspaces/${slug}/tokens`).set(bearer(team.owner.token))
      .send({ name: 'CI', scopes: ['settings:manage', 'tasks:read'] });
    expect(token.status).toBe(201);
    expect((await patchSettings({ token: token.body.token }, { enabled: true })).status).toBe(403);
    // Reading works with the token and its tasks:read scope
    expect((await http().get(aiUrl()).set(bearer(token.body.token))).status).toBe(200);
    expect((await settings(team.owner)).body.enabled).toBe(false);
  });

  it('validates the body', async () => {
    expect((await patchSettings(team.owner, {})).status).toBe(400);
    expect((await patchSettings(team.owner, { enabled: 'yes' })).status).toBe(400);
    expect((await patchSettings(team.owner, { autoReview: 1 })).status).toBe(400);
    expect((await patchSettings(team.owner, { githubToken: 'short' })).status).toBe(400);
    expect((await patchSettings(team.owner, { githubToken: 'has spaces and is long enough to pass length' })).status).toBe(400);
    expect((await patchSettings(team.owner, { githubToken: 42 })).status).toBe(400);
  });

  it('stores the GitHub token encrypted, bound to the workspace, and never returns it', async () => {
    const res = await patchSettings(team.owner, { githubToken: GITHUB_TOKEN });
    expect(res.status).toBe(200);
    expect(res.body.githubTokenSet).toBe(true);
    expect(JSON.stringify(res.body)).not.toContain(GITHUB_TOKEN);

    const stored = await mongoose.connection.collection('workspaces').findOne({ slug });
    const box = stored?.integrations?.github?.accessTokenEncrypted as string;
    expect(box).toMatch(/^v1\./);
    expect(box).not.toContain(GITHUB_TOKEN);
    expect(decryptSecret(box, String(stored?._id))).toBe(GITHUB_TOKEN);
    expect(() => decryptSecret(box, 'another-workspace')).toThrow();

    // Not in any response a member can read
    const bodies = [
      await settings(team.developer),
      await http().get(`/api/workspaces/${slug}`).set(bearer(team.developer.token)),
      await http().get(`/api/workspaces/${slug}/integrations/github`).set(bearer(team.owner.token)),
      await http().get(`/api/workspaces/${slug}/activity`).set(bearer(team.owner.token)),
    ];
    for (const body of bodies) expect(JSON.stringify(body.body)).not.toContain(GITHUB_TOKEN);
    expect(Object.keys(bodies[0].body).sort()).toEqual(['autoReview', 'available', 'dailyLimit', 'enabled', 'githubTokenSet', 'model', 'usedToday']);
  });

  it('clears the token with null and audits every change without the token', async () => {
    expect((await patchSettings(team.owner, { githubToken: null })).body.githubTokenSet).toBe(false);
    const stored = await mongoose.connection.collection('workspaces').findOne({ slug });
    expect(stored?.integrations?.github?.accessTokenEncrypted).toBeUndefined();
    await patchSettings(team.owner, { githubToken: GITHUB_TOKEN });

    const log = await http().get(`/api/workspaces/${slug}/activity?area=ai`).set(bearer(team.owner.token));
    expect(log.status).toBe(200);
    const entries = log.body.items.filter((item: { action: string }) => item.action === 'ai.settings_updated');
    expect(entries.length).toBeGreaterThanOrEqual(3);
    expect(JSON.stringify(log.body)).not.toContain(GITHUB_TOKEN);
    expect(entries.flatMap((entry: { changes: { field: string }[] }) => entry.changes.map(change => change.field))).toContain('githubToken');
  });
});

// ================================================================
describe('running a review: refusals', () => {
  it('answers 503 AI_DISABLED until the workspace opts in', async () => {
    const res = await run(team.developer);
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('AI_DISABLED');
    expect(provider).not.toHaveBeenCalled();
    expect(githubCalls).toHaveLength(0);
    expect(await reviewCount(webTask._id)).toBe(0);
  });

  it('answers 503 AI_DISABLED when the server has no API key, even when the workspace opted in', async () => {
    expect((await patchSettings(team.owner, { enabled: true })).body.enabled).toBe(true);
    delete process.env.DASHSCOPE_API_KEY;
    const res = await run(team.developer);
    process.env.DASHSCOPE_API_KEY = 'sk-test-never-logged';
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('AI_DISABLED');
  });

  it('needs tasks:write to start and tasks:read to look', async () => {
    expect((await run(team.viewer)).status).toBe(403);
    expect((await http().post(runUrl()).send({})).status).toBe(401);
    expect((await run(outsider)).status).toBeGreaterThanOrEqual(403);
    expect((await http().get(listUrl()).set(bearer(team.viewer.token))).status).toBe(200);
    expect((await http().get(listUrl()).set(bearer(outsider.token))).status).toBeGreaterThanOrEqual(403);
  });

  it('refuses a task with no linked pull request, a bad address and an unknown task', async () => {
    const none = await run(team.developer, {}, plainTask._id);
    expect(none.status).toBe(400);
    expect(none.body.code).toBe('NO_PULL_REQUEST');

    for (const prUrl of ['https://evil.example/acme/app/pull/1', 'http://github.com/acme/app/pull/1', 'https://github.com/acme/app/pull/1/files', 'nonsense']) {
      const bad = await run(team.developer, { prUrl });
      expect(bad.status).toBe(400);
      expect(bad.body.code).toBe('INVALID_PR_URL');
    }
    expect((await run(team.developer, { prUrl: 42 })).status).toBe(400);
    expect((await run(team.developer, {}, unknownId())).status).toBe(404);
    expect((await run(team.developer, {}, 'not-an-id')).status).toBe(404);
    expect(provider).not.toHaveBeenCalled();
  });
});

// ================================================================
describe('running a review: success', () => {
  let completed: ReviewView;
  // The mocks are reset before every test, so what the first run used is captured here
  let modelInput: any;
  let githubSeen: { url: string; authorization: string | null }[] = [];

  it('queues with 202, runs after the response and stores the result', async () => {
    holdProvider();
    const queued = await run(team.developer);
    expect(queued.status).toBe(202);
    expect(queued.body).toMatchObject({
      status: 'queued', verdict: null, model: 'qwen-plus',
      pr: { repo: 'acme/app', number: 7, url: 'https://github.com/acme/app/pull/7' },
      requestedBy: { name: 'Dan Developer' },
    });
    expect(queued.body.criteria).toBeUndefined();

    // While it runs, a second request for the same task is refused
    const conflict = await run(team.developer);
    expect(conflict.status).toBe(409);
    expect(conflict.body.code).toBe('REVIEW_IN_PROGRESS');

    for (let attempt = 0; attempt < 100 && !release; attempt += 1) await new Promise(resolve => setTimeout(resolve, 20));
    expect(release).not.toBeNull();
    release?.();
    completed = await waitForReview(team.developer, queued.body._id);
    modelInput = provider.mock.calls[0]?.[0];
    githubSeen = [...githubCalls];
    expect(completed.status).toBe('completed');
  });

  it('keeps the ticket wording, the evidence, the counts, the model and the tokens', () => {
    expect(completed).toMatchObject({
      verdict: 'match', model: 'qwen-test', truncated: false, omittedFiles: [], error: '',
      counts: { met: 2, partial: 0, missing: 0, issues: 1 },
      usage: { inputTokens: 1200, outputTokens: 300 },
      pr: { repo: 'acme/app', number: 7, headSha: 'sha-one' },
      requestedBy: { name: 'Dan Developer' },
    });
    expect(completed.criteria!.map(item => item.text)).toEqual(['A user can sign in with email and password', 'A wrong password shows an error message']);
    expect(completed.criteria![0].evidence[0]).toEqual({ file: 'src/login.ts', note: 'form submits to /api/login' });
    expect(completed.issues![0]).toMatchObject({ severity: 'low', file: 'src/login.ts' });
  });

  it('sent the model the ticket, the pull request and its diff, nothing else', () => {
    const input = modelInput;
    expect(input.ticket).toMatchObject({ key: 'WEB-' + webTask.number, title: 'Build the login', criteriaSource: 'explicit' });
    expect(input.ticket.criteria).toEqual(['A user can sign in with email and password', 'A wrong password shows an error message']);
    expect(input.pr).toMatchObject({ repo: 'acme/app', number: 7, headSha: 'sha-one' });
    expect(input.selection.included.map((file: { filename: string }) => file.filename)).toEqual(['src/login.ts', 'README.md']);
    const serialized = JSON.stringify(input);
    expect(serialized).not.toContain('sk-test');
    expect(serialized).not.toContain(GITHUB_TOKEN);
    expect(serialized).not.toContain(plainTask._id);
  });

  it('read GitHub with the saved token because the repository is linked to the workspace', () => {
    expect(githubSeen.length).toBeGreaterThanOrEqual(2);
    expect(githubSeen.every(call => call.authorization === `Bearer ${GITHUB_TOKEN}`)).toBe(true);
    expect(githubSeen.map(call => call.url)).toEqual(expect.arrayContaining([
      'https://api.github.com/repos/acme/app/pulls/7',
      'https://api.github.com/repos/acme/app/pulls/7/files?per_page=100&page=1',
    ]));
  });

  it('records the activity and tells the person who asked', async () => {
    const activity = await http().get(`${tasksUrl(slug)}/${webTask._id}/activity`).set(bearer(team.owner.token));
    const entry = activity.body.items.find((item: { action: string }) => item.action === 'ai.review_completed');
    expect(entry).toBeDefined();
    expect(entry.changes).toEqual([expect.objectContaining({ field: 'verdict', to: 'match' })]);

    const inbox = await http().get('/api/notifications?limit=50').set(bearer(team.developer.token));
    const note = inbox.body.items.find((item: { type: string }) => item.type === 'ai.review_completed');
    expect(note).toBeDefined();
    expect(note.task._id).toBe(webTask._id);
    const ownerInbox = await http().get('/api/notifications?limit=50').set(bearer(team.owner.token));
    expect(ownerInbox.body.items.some((item: { type: string }) => item.type === 'ai.review_completed')).toBe(false);
  });

  it('lists the history without the long parts and counts the review in the daily usage', async () => {
    const list = await http().get(listUrl()).set(bearer(team.viewer.token));
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).toMatchObject({ _id: completed._id, status: 'completed', verdict: 'match' });
    expect(list.body[0].criteria).toBeUndefined();
    expect(list.body[0].issues).toBeUndefined();
    expect((await settings(team.owner)).body.usedToday).toBe(1);
  });

  it('never lets a model that says match override the rules', async () => {
    provider.mockImplementationOnce(async () => answer({
      verdict: 'match',
      criteria: [
        { index: 1, status: 'met', evidence: [{ file: 'src/login.ts', note: 'ok' }] },
        { index: 2, status: 'partial', evidence: [{ file: 'src/login.ts', note: 'only some' }] },
      ],
    }));
    const review = await runAndWait(team.developer);
    expect(review.verdict).toBe('partial');
    expect(review.counts).toMatchObject({ met: 1, partial: 1, missing: 0 });

    provider.mockImplementationOnce(async () => answer({
      verdict: 'match',
      issues: [{ severity: 'high', category: 'security', file: 'src/login.ts', line: 2, message: 'Password logged in clear text.' }],
    }));
    expect((await runAndWait(team.developer)).verdict).toBe('partial');
  });

  it('uses the description and checklist when there are no explicit criteria, and says so', async () => {
    await http().patch(`${tasksUrl(slug)}/${webTask._id}`).set(bearer(team.owner.token))
      .send({ acceptanceCriteria: [], checklist: [{ text: 'Login form exists' }, { text: 'Error on wrong password' }] });
    provider.mockImplementationOnce(async () => answer({ criteria: [{ index: 1, status: 'met', evidence: [{ file: 'src/login.ts', note: 'ok' }] }, { index: 2, status: 'missing', evidence: [], explanation: '' }] }));
    const review = await runAndWait(team.developer);
    expect(review.error).toBe('');
    expect(provider.mock.calls[0][0].ticket).toMatchObject({ criteriaSource: 'derived', criteria: ['Login form exists', 'Error on wrong password'] });
    expect(review.summary).toMatch(/^No explicit acceptance criteria were set/);
    expect(review.criteria!.map(item => item.text)).toEqual(['Login form exists', 'Error on wrong password']);
    expect(review.verdict).toBe('partial');
    await http().patch(`${tasksUrl(slug)}/${webTask._id}`).set(bearer(team.owner.token)).send({
      checklist: [], acceptanceCriteria: [{ text: 'A user can sign in with email and password' }, { text: 'A wrong password shows an error message' }],
    });
  });

  it('is invisible to other workspaces and to other tasks', async () => {
    const list = await http().get(listUrl()).set(bearer(team.owner.token));
    const id = list.body[0]._id;
    // The same ids through another workspace's slug, with another workspace's owner
    expect((await http().get(`${listUrl(webTask._id, other.workspace.slug)}/${id}`).set(bearer(other.owner.token))).status).toBe(404);
    expect((await http().get(listUrl(webTask._id, other.workspace.slug)).set(bearer(other.owner.token))).status).toBe(404);
    expect((await http().post(runUrl(webTask._id, other.workspace.slug)).set(bearer(other.owner.token)).send({})).status).toBe(404);
    expect((await http().get(`${listUrl(webTask._id)}/${id}`).set(bearer(other.owner.token))).status).toBeGreaterThanOrEqual(403);
    // Another task of the same workspace does not expose it either
    expect((await http().get(`${listUrl(plainTask._id)}/${id}`).set(bearer(team.owner.token))).status).toBe(404);
    expect((await http().get(`${listUrl()}/${unknownId()}`).set(bearer(team.owner.token))).status).toBe(404);
    expect((await http().get(`${listUrl()}/not-an-id`).set(bearer(team.owner.token))).status).toBe(404);
    // Settings are per workspace
    expect((await http().get(`/api/workspaces/${other.workspace.slug}/ai`).set(bearer(other.owner.token))).body).toMatchObject({ enabled: false, githubTokenSet: false, usedToday: 0 });
  });
});

// ================================================================
describe('running a review: partial reviews and failures', () => {
  it('flags a partial review, lists what was left out and never reports match', async () => {
    process.env.AI_REVIEW_MAX_DIFF_CHARS = '5000';
    pullFiles = [
      { filename: 'src/a.ts', patch: '+'.repeat(2000) },
      { filename: 'src/b.ts', patch: '+'.repeat(1900) },
      { filename: 'pnpm-lock.yaml', patch: '+'.repeat(6000) },
      { filename: 'logo.png' },
    ];
    const review = await runAndWait(team.developer);
    delete process.env.AI_REVIEW_MAX_DIFF_CHARS;

    expect(review.status).toBe('completed');
    expect(review.truncated).toBe(true);
    expect(review.omittedFiles).toEqual(['pnpm-lock.yaml']);
    expect(review.verdict).toBe('partial');
    const input = provider.mock.calls[0][0];
    expect(input.selection.included.map((file: { filename: string }) => file.filename)).toEqual(['src/b.ts', 'src/a.ts']);
    expect(input.selection.withoutDiff).toEqual(['logo.png']);
    expect(input.manifest).toHaveLength(4);
  });

  it('reports a GitHub failure on the review without calling the model or using quota', async () => {
    const before = (await settings(team.owner)).body.usedToday;
    githubStatus = 404;
    const review = await runAndWait(team.developer);
    expect(review.status).toBe('failed');
    expect(review.verdict).toBeNull();
    expect(review.error).toMatch(/GitHub did not find this pull request/);
    expect(JSON.stringify(review)).not.toContain(GITHUB_TOKEN);
    expect(provider).not.toHaveBeenCalled();
    expect((await settings(team.owner)).body.usedToday).toBe(before);
  });

  it('reports a provider failure as a safe message', async () => {
    const { AiReviewError } = jest.requireActual('../utils/ai/types.js') as typeof import('../utils/ai/types.js');
    provider.mockImplementationOnce(async () => { throw new AiReviewError('The AI provider is having problems. Try again in a few minutes.', 'AI_UNAVAILABLE'); });
    const failed = await runAndWait(team.developer);
    expect(failed.status).toBe('failed');
    expect(failed.error).toBe('The AI provider is having problems. Try again in a few minutes.');

    provider.mockImplementationOnce(async () => { throw new Error('connect ECONNREFUSED sk-test-never-logged'); });
    const unexpected = await runAndWait(team.developer);
    expect(unexpected.status).toBe('failed');
    expect(unexpected.error).not.toContain('sk-test');
    expect(unexpected.error).not.toContain('ECONNREFUSED');
  });

  it('does not send the saved GitHub token for a repository none of the workspace tasks link to', async () => {
    githubStatus = 404;
    const review = await runAndWait(team.developer, { prUrl: 'https://github.com/someone/private-repo/pull/3' });
    expect(review.status).toBe('failed');
    expect(review.pr.repo).toBe('someone/private-repo');
    expect(githubCalls.length).toBeGreaterThan(0);
    expect(githubCalls.every(call => call.authorization === null)).toBe(true);
    expect(review.error).toMatch(/save a GitHub token/);
  });

  it('can review a pull request given by address when the repository is linked', async () => {
    const review = await runAndWait(team.developer, { prUrl: 'https://github.com/acme/app/pull/8' });
    expect(review.status).toBe('completed');
    expect(review.pr.number).toBe(8);
    expect(githubCalls.every(call => call.authorization === `Bearer ${GITHUB_TOKEN}`)).toBe(true);
  });

  it('stops at the daily limit with a clear message', async () => {
    const used = (await settings(team.owner)).body.usedToday;
    process.env.AI_REVIEW_DAILY_LIMIT = String(used);
    const res = await run(team.developer);
    expect(res.status).toBe(429);
    expect(res.body.code).toBe('AI_DAILY_LIMIT');
    expect(res.body.message).toMatch(/AI reviews for today/);
    expect((await settings(team.owner)).body).toMatchObject({ dailyLimit: used, usedToday: used });
    delete process.env.AI_REVIEW_DAILY_LIMIT;
    const again = await run(team.developer);
    expect(again.status).toBe(202);
    expect((await waitForReview(team.developer, again.body._id)).status).toBe('completed');
  });

  it('keeps only the latest 10 reviews in the history', async () => {
    for (let index = 0; index < 11; index += 1) {
      await mongoose.connection.collection('aireviews').insertOne({
        workspace: new mongoose.Types.ObjectId(team.workspace.id), task: new mongoose.Types.ObjectId(plainTask._id),
        pr: { repo: 'a/b', number: index + 1, url: `https://github.com/a/b/pull/${index + 1}`, title: '', headSha: '' },
        status: 'completed', verdict: 'match', summary: '', criteria: [], issues: [], counts: { met: 0, partial: 0, missing: 0, issues: 0 },
        truncated: false, omittedFiles: [], model: 'm', usage: { inputTokens: 0, outputTokens: 0 }, error: '', requestedBy: null,
        createdAt: new Date(Date.now() - index * 1000),
      });
    }
    const list = await http().get(listUrl(plainTask._id)).set(bearer(team.owner.token));
    expect(list.body).toHaveLength(10);
    expect(list.body[0].pr.number).toBe(1);
  });
});

// ================================================================
describe('auto review from the GitHub webhook', () => {
  const waitForCount = async (count: number) => {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const reviews = await mongoose.connection.collection('aireviews').find({ task: new mongoose.Types.ObjectId(webTask._id), 'pr.headSha': 'sha-auto' }).toArray();
      if (reviews.length >= count && reviews.every(review => review.status === 'completed' || review.status === 'failed')) return reviews;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    return mongoose.connection.collection('aireviews').find({ task: new mongoose.Types.ObjectId(webTask._id), 'pr.headSha': 'sha-auto' }).toArray();
  };

  it('does nothing while auto review is off', async () => {
    const before = await reviewCount(webTask._id);
    await deliver('pull_request', prPayload('synchronize', 7, webTask.number, 'sha-auto'));
    await new Promise(resolve => setTimeout(resolve, 200));
    expect(await reviewCount(webTask._id)).toBe(before);
  });

  it('queues one review per head commit for a linked pull request', async () => {
    await new Promise(resolve => setTimeout(resolve, 100));
    expect((await patchSettings(team.owner, { autoReview: true })).body.autoReview).toBe(true);
    pullHeadSha = 'sha-auto';

    const first = await deliver('pull_request', prPayload('synchronize', 7, webTask.number, 'sha-auto'));
    expect(first.status).toBe(200);
    const reviews = await waitForCount(1);
    expect(reviews).toHaveLength(1);
    expect(reviews[0]).toMatchObject({ status: 'completed', requestedBy: null, verdict: 'match' });

    // Same commit again (GitHub redelivery, edited): no second review
    await deliver('pull_request', prPayload('synchronize', 7, webTask.number, 'sha-auto'));
    await new Promise(resolve => setTimeout(resolve, 300));
    expect(await waitForCount(1)).toHaveLength(1);
  });

  it('skips drafts, closed and edited events', async () => {
    const before = await reviewCount(webTask._id);
    await deliver('pull_request', prPayload('opened', 7, webTask.number, 'sha-draft', { draft: true }));
    await deliver('pull_request', prPayload('edited', 7, webTask.number, 'sha-edit'));
    await deliver('pull_request', prPayload('closed', 7, webTask.number, 'sha-closed', { state: 'closed' }));
    await new Promise(resolve => setTimeout(resolve, 300));
    expect(await reviewCount(webTask._id)).toBe(before);
  });

  it('does nothing when the workspace opted out of AI review', async () => {
    await patchSettings(team.owner, { enabled: false });
    const before = await reviewCount(webTask._id);
    await deliver('pull_request', prPayload('synchronize', 7, webTask.number, 'sha-off'));
    await new Promise(resolve => setTimeout(resolve, 300));
    expect(await reviewCount(webTask._id)).toBe(before);
    const refused = await run(team.developer);
    expect(refused.status).toBe(503);
  });
});

// ================================================================
describe('simultaneous requests', () => {
  it('starts only one review when two requests for the same task arrive together', async () => {
    await patchSettings(team.owner, { enabled: true });
    holdProvider();
    const [first, second] = await Promise.all([run(team.developer), run(team.developer)]);
    expect([first.status, second.status].sort()).toEqual([202, 409]);
    const queued = first.status === 202 ? first : second;
    for (let attempt = 0; attempt < 100 && !release; attempt += 1) await new Promise(resolve => setTimeout(resolve, 20));
    release?.();
    expect((await waitForReview(team.developer, queued.body._id)).status).toBe('completed');
  });
});
