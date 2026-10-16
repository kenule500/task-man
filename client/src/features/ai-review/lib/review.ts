import type {
  AiReview, AiSettings, AiVerdict, CriterionStatus, IssueSeverity, ReviewIssue,
} from '../types';

// Pure helpers for the review UI (tones, grouping, whether a run is possible, link validation).

export type Tone = 'success' | 'warning' | 'danger';

/** Badge colors: Match is success, Partial is warning, Mismatch is danger. */
export const VERDICT_TONE: Record<AiVerdict, Tone> = { match: 'success', partial: 'warning', mismatch: 'danger' };
export const CRITERION_TONE: Record<CriterionStatus, Tone> = { met: 'success', partial: 'warning', missing: 'danger' };
export const SEVERITY_TONE: Record<IssueSeverity, Tone> = { high: 'danger', medium: 'warning', low: 'success' };

export const SEVERITY_ORDER: readonly IssueSeverity[] = ['high', 'medium', 'low'];

export const POLL_INTERVAL_MS = 2500;
/** Stop polling a review that has been "running" longer than the server allows (it is marked failed on the next run). */
export const POLL_GIVE_UP_MS = 12 * 60 * 1000;

export const isActive = (review: Pick<AiReview, 'status'> | null | undefined): boolean =>
  review?.status === 'queued' || review?.status === 'running';

/** Whether any review of the list is still being worked on (keep polling). */
export const hasActiveReview = (reviews: readonly Pick<AiReview, 'status' | 'createdAt'>[], now = Date.now()): boolean =>
  reviews.some(review => isActive(review) && now - Date.parse(review.createdAt) < POLL_GIVE_UP_MS);

export interface IssueGroup {
  severity: IssueSeverity;
  issues: ReviewIssue[];
}

/** Issues grouped by severity, most severe first; empty groups are left out. */
export const groupIssues = (issues: readonly ReviewIssue[] | undefined): IssueGroup[] =>
  SEVERITY_ORDER
    .map(severity => ({ severity, issues: (issues ?? []).filter(issue => issue.severity === severity) }))
    .filter(group => group.issues.length > 0);

export const totalCriteria = (counts: AiReview['counts']): number => counts.met + counts.partial + counts.missing;

// ----------------------------------------------------------------
// Pull request address (mirrors the server's strict pattern)
// ----------------------------------------------------------------
const PR_URL = /^https:\/\/github\.com\/[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}\/pull\/[1-9]\d{0,8}$/;

export const isPullRequestUrl = (value: string): boolean => PR_URL.test(value.trim());

// ----------------------------------------------------------------
// Can a review be started?
// ----------------------------------------------------------------
export type RunBlock = 'unavailable' | 'disabled' | 'readOnly' | 'noPr' | null;

export interface RunContext {
  settings: Pick<AiSettings, 'available' | 'enabled'> | null;
  canWrite: boolean;
  /** The task has a linked pull request, or the person typed a valid address. */
  hasPullRequest: boolean;
}

/** The first reason a review cannot start, in the order the person can fix them; null when it can. */
export const runBlock = ({ settings, canWrite, hasPullRequest }: RunContext): RunBlock => {
  if (!settings || !settings.available) return 'unavailable';
  if (!settings.enabled) return 'disabled';
  if (!canWrite) return 'readOnly';
  if (!hasPullRequest) return 'noPr';
  return null;
};

/** "owner/repo#12" */
export const prLabel = (pr: Pick<AiReview['pr'], 'repo' | 'number'>): string => `${pr.repo}#${pr.number}`;

/** The review the panel shows first: the selected one, else the newest. */
export const pickShown = <T extends { _id: string }>(reviews: readonly T[], selectedId: string | null): T | null =>
  reviews.find(review => review._id === selectedId) ?? reviews[0] ?? null;
