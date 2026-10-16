import { AiReviewError, type PrFile, type PullRequestData } from './types.js';

// Reads a pull request from the GitHub REST API. Only api.github.com is ever contacted, and only for owner, repo
// and number that passed a strict pattern, so a pull request URL cannot be used to reach another host.

const API = 'https://api.github.com';
const PR_URL = /^https:\/\/github\.com\/([A-Za-z0-9_.-]{1,100})\/([A-Za-z0-9_.-]{1,100})\/pull\/([1-9]\d{0,8})$/;
export const FILES_PER_PAGE = 100;
export const MAX_FILE_PAGES = 3;
const REQUEST_TIMEOUT_MS = 20_000;

export interface PrRef {
  owner: string;
  repo: string;
  number: number;
  /** owner/name */
  fullName: string;
  url: string;
}

/** `https://github.com/<owner>/<repo>/pull/<n>` exactly (no query, fragment, port, credentials or extra path); null otherwise. */
export const parsePrUrl = (value: unknown): PrRef | null => {
  if (typeof value !== 'string') return null;
  const match = PR_URL.exec(value.trim());
  if (!match) return null;
  const [, owner, repo, number] = match;
  if ([owner, repo].some(part => part === '.' || part === '..')) return null;
  return { owner, repo, number: Number(number), fullName: `${owner}/${repo}`, url: `https://github.com/${owner}/${repo}/pull/${number}` };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const str = (value: unknown, max: number): string => (typeof value === 'string' ? value.slice(0, max) : '');
const num = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0);

const headers = (token?: string): Record<string, string> => ({
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'TaskMan-AI-Review',
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
});

/** GET + JSON, with errors turned into messages that are safe to show (the token and response bodies never appear). */
const getJson = async (path: string, token?: string): Promise<unknown> => {
  let response: Response;
  try {
    response = await fetch(`${API}${path}`, {
      headers: headers(token),
      redirect: 'error',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new AiReviewError('GitHub could not be reached. Try again later.', 'GITHUB_UNREACHABLE');
  }
  if (response.status === 404) {
    throw new AiReviewError(
      token
        ? 'GitHub did not find this pull request. Check the link and that the saved GitHub token can read the repository.'
        : 'GitHub did not find this pull request. If the repository is private, save a GitHub token in the AI code review settings.',
      'GITHUB_NOT_FOUND',
    );
  }
  if (response.status === 401) throw new AiReviewError('GitHub rejected the saved token. Save a new GitHub token in the AI code review settings.', 'GITHUB_AUTH');
  if (response.status === 403 || response.status === 429) {
    throw new AiReviewError('GitHub refused the request (rate limit or missing access). Save a GitHub token in the AI code review settings or try later.', 'GITHUB_FORBIDDEN');
  }
  if (!response.ok) throw new AiReviewError(`GitHub answered with an error (${response.status}). Try again later.`, 'GITHUB_ERROR');
  try {
    return await response.json();
  } catch {
    throw new AiReviewError('GitHub sent an unreadable answer. Try again later.', 'GITHUB_ERROR');
  }
};

const toFile = (raw: unknown): PrFile | null => {
  if (!isRecord(raw)) return null;
  const filename = str(raw.filename, 300);
  if (!filename) return null;
  return {
    filename,
    status: str(raw.status, 20) || 'modified',
    additions: num(raw.additions),
    deletions: num(raw.deletions),
    patch: typeof raw.patch === 'string' && raw.patch.length > 0 ? raw.patch : undefined,
    previousFilename: str(raw.previous_filename, 300) || undefined,
  };
};

/** Metadata and changed files (up to 3 pages of 100). `token` is the workspace's GitHub token, if the repository may use it. */
export const fetchPullRequest = async (ref: PrRef, token?: string): Promise<PullRequestData> => {
  const base = `/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}/pulls/${ref.number}`;
  const meta = await getJson(base, token);
  if (!isRecord(meta)) throw new AiReviewError('GitHub sent an unexpected answer. Try again later.', 'GITHUB_ERROR');

  const files: PrFile[] = [];
  for (let page = 1; page <= MAX_FILE_PAGES; page += 1) {
    const batch = await getJson(`${base}/files?per_page=${FILES_PER_PAGE}&page=${page}`, token);
    if (!Array.isArray(batch)) break;
    for (const item of batch) {
      const file = toFile(item);
      if (file) files.push(file);
    }
    if (batch.length < FILES_PER_PAGE) break;
  }

  const head = isRecord(meta.head) ? meta.head : {};
  const baseInfo = isRecord(meta.base) ? meta.base : {};
  return {
    repo: ref.fullName,
    number: ref.number,
    url: ref.url,
    title: str(meta.title, 300),
    body: str(meta.body, 20_000),
    headSha: str(head.sha, 64),
    headRef: str(head.ref, 250),
    baseRef: str(baseInfo.ref, 250),
    files,
    changedFiles: num(meta.changed_files) || files.length,
  };
};
