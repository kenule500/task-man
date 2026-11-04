import crypto from 'crypto';
import type { ITaskLink, TaskLinkState, TaskStatus } from '../models/taskModel.js';

// ================================================================
// Pure helpers for the GitHub webhook: signature check, task key extraction and
// turning a delivery into "these keys get this link (and maybe a status move)".
// ================================================================

export const MAX_KEYS_PER_TEXT = 10;
export const MAX_COMMITS = 50;

// ----------------------------------------------------------------
// Signature
// ----------------------------------------------------------------
const SIGNATURE_PATTERN = /^sha256=([a-f0-9]{64})$/i;

export const signBody = (secret: string, rawBody: Buffer | string): string =>
  `sha256=${crypto.createHmac('sha256', secret).update(rawBody).digest('hex')}`;

/**
 * Checks GitHub's `X-Hub-Signature-256` header (HMAC SHA-256 of the raw body) in constant time.
 * Malformed headers (missing, wrong prefix or length) are rejected before the comparison.
 */
export const verifySignature = (secret: string, rawBody: Buffer, header: string | undefined): boolean => {
  if (!secret || typeof header !== 'string') return false;
  const match = SIGNATURE_PATTERN.exec(header.trim());
  if (!match) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  const received = Buffer.from(match[1], 'hex');
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
};

// ----------------------------------------------------------------
// Task keys
// ----------------------------------------------------------------
/** A key as typed in text: "WEB-12" (upper case, like the keys the app displays). */
const KEY_PATTERN = /(?<![A-Za-z0-9])([A-Z][A-Z0-9]{1,5})-(\d{1,9})(?![0-9A-Za-z])/g;
/** Branch names are usually lower case ("feature/web-12-login"), so they match case-insensitively. */
const KEY_PATTERN_ANY_CASE = /(?<![A-Za-z0-9])([A-Za-z][A-Za-z0-9]{1,5})-(\d{1,9})(?![0-9A-Za-z])/g;

export interface TaskKeyRef {
  prefix: string;
  number: number;
}

/** Distinct task keys mentioned in `texts`, upper-cased, in order of appearance. */
export const extractTaskKeys = (texts: (string | undefined | null)[], options: { ignoreCase?: boolean } = {}): TaskKeyRef[] => {
  const pattern = new RegExp((options.ignoreCase ? KEY_PATTERN_ANY_CASE : KEY_PATTERN).source, 'g');
  const found = new Map<string, TaskKeyRef>();
  for (const text of texts) {
    if (typeof text !== 'string') continue;
    for (const match of text.slice(0, 20_000).matchAll(pattern)) {
      const ref = { prefix: match[1].toUpperCase(), number: Number(match[2]) };
      if (ref.number < 1) continue;
      found.set(`${ref.prefix}-${ref.number}`, ref);
      if (found.size >= MAX_KEYS_PER_TEXT) return [...found.values()];
    }
  }
  return [...found.values()];
};

// ----------------------------------------------------------------
// Status transitions
// ----------------------------------------------------------------
export type GithubTransition = 'start' | 'complete';

/** Which statuses a transition may start from and where it goes; completed tasks are never reopened. */
export const TRANSITIONS: Record<GithubTransition, { from: TaskStatus[]; to: TaskStatus }> = {
  start: { from: ['pending'], to: 'in-progress' },
  complete: { from: ['pending', 'in-progress'], to: 'completed' },
};

/** The status a task moves to, or null when the transition does not apply to it. */
export const nextStatus = (current: TaskStatus, transition: GithubTransition | undefined): TaskStatus | null => {
  if (!transition) return null;
  const rule = TRANSITIONS[transition];
  return rule.from.includes(current) ? rule.to : null;
};

// ----------------------------------------------------------------
// Payload -> plan
// ----------------------------------------------------------------
export type LinkInput = Omit<ITaskLink, 'updatedAt'>;

export interface PlanItem {
  keys: TaskKeyRef[];
  link: LinkInput;
  transition?: GithubTransition;
}

const REPO_PATTERN = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown, max: number): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value.slice(0, max) : undefined;
const firstLine = (value: unknown, max = 200): string => (text(value, 2000) ?? '').split(/\r?\n/, 1)[0].trim().slice(0, max);

/** Only https://github.com/... links are stored (the panel renders them as hrefs). */
export const safeGithubUrl = (value: unknown): string | undefined => {
  const raw = text(value, 500);
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.username || url.password || url.port) return undefined;
    return url.href;
  } catch {
    return undefined;
  }
};

const branchUrl = (repo: string, branch: string): string =>
  `https://github.com/${repo}/tree/${branch.split('/').map(encodeURIComponent).join('/')}`;

const branchOf = (ref: unknown): string | undefined => {
  const value = text(ref, 250);
  return value?.startsWith('refs/heads/') ? value.slice('refs/heads/'.length) : undefined;
};

const branchItem = (repo: string, branch: string, author: string | undefined): PlanItem | null => {
  const keys = extractTaskKeys([branch], { ignoreCase: true });
  if (keys.length === 0) return null;
  return { keys, link: { provider: 'github', kind: 'branch', url: branchUrl(repo, branch), title: branch.slice(0, 200), repo, author } };
};

const repoOf = (payload: Record<string, unknown>): string | undefined => {
  const repo = isRecord(payload.repository) ? text(payload.repository.full_name, 201) : undefined;
  return repo && REPO_PATTERN.test(repo) && !repo.split('/').some(part => part === '.' || part === '..') ? repo : undefined;
};

const PR_ACTIONS = new Set(['opened', 'reopened', 'edited', 'closed', 'synchronize', 'ready_for_review', 'converted_to_draft']);

const planPullRequest = (payload: Record<string, unknown>, repo: string): PlanItem[] => {
  const action = text(payload.action, 40);
  const pr = payload.pull_request;
  if (!action || !PR_ACTIONS.has(action) || !isRecord(pr)) return [];

  const url = safeGithubUrl(pr.html_url);
  const head = isRecord(pr.head) ? pr.head : {};
  const branch = text(head.ref, 250);
  const number = typeof pr.number === 'number' && Number.isInteger(pr.number) ? pr.number : undefined;
  if (!url) return [];

  const merged = pr.merged === true;
  const state: TaskLinkState = merged ? 'merged' : pr.state === 'closed' ? 'closed' : 'open';
  const keys = extractTaskKeys([text(pr.title, 500), text(pr.body, 20_000)]);
  for (const ref of extractTaskKeys([branch], { ignoreCase: true })) {
    if (!keys.some(key => key.prefix === ref.prefix && key.number === ref.number)) keys.push(ref);
  }
  if (keys.length === 0) return [];

  // Only real lifecycle changes move tasks; edits and pushes just refresh the link
  const transition: GithubTransition | undefined =
    action === 'closed' && merged ? 'complete'
      : (action === 'opened' || action === 'reopened') && pr.draft !== true ? 'start'
        : action === 'ready_for_review' ? 'start' : undefined;

  const user = isRecord(pr.user) ? text(pr.user.login, 100) : undefined;
  return [{
    keys,
    link: { provider: 'github', kind: 'pull_request', url, title: firstLine(pr.title), number, state, repo, sha: text(head.sha, 64), author: user },
    transition,
  }];
};

const planPush = (payload: Record<string, unknown>, repo: string): PlanItem[] => {
  if (payload.deleted === true) return [];
  const items: PlanItem[] = [];
  const pusher = isRecord(payload.pusher) ? text(payload.pusher.name, 100) : undefined;
  const branch = branchOf(payload.ref);
  if (branch) {
    const item = branchItem(repo, branch, pusher);
    if (item) items.push(item);
  }
  const commits = Array.isArray(payload.commits) ? payload.commits.slice(0, MAX_COMMITS) : [];
  for (const commit of commits) {
    if (!isRecord(commit)) continue;
    const url = safeGithubUrl(commit.url);
    const sha = text(commit.id, 64);
    const keys = extractTaskKeys([text(commit.message, 5000)]);
    if (!url || !sha || keys.length === 0) continue;
    const author = isRecord(commit.author) ? text(commit.author.username, 100) ?? text(commit.author.name, 100) : undefined;
    items.push({ keys, link: { provider: 'github', kind: 'commit', url, title: firstLine(commit.message), repo, sha, author } });
  }
  return items;
};

const planCreate = (payload: Record<string, unknown>, repo: string): PlanItem[] => {
  if (payload.ref_type !== 'branch') return [];
  const branch = text(payload.ref, 250);
  const sender = isRecord(payload.sender) ? text(payload.sender.login, 100) : undefined;
  const item = branch ? branchItem(repo, branch, sender) : null;
  return item ? [item] : [];
};

/** What a delivery means for tasks; `null` when the event type is not handled at all. */
export const planGithubEvent = (event: string, payload: unknown): PlanItem[] | null => {
  if (event !== 'pull_request' && event !== 'push' && event !== 'create') return null;
  if (!isRecord(payload)) return [];
  const repo = repoOf(payload);
  if (!repo) return [];
  if (event === 'pull_request') return planPullRequest(payload, repo);
  if (event === 'push') return planPush(payload, repo);
  return planCreate(payload, repo);
};
