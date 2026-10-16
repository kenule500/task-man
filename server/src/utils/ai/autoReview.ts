// Which GitHub deliveries start an automatic AI review (when the workspace turned auto review on).

const AUTO_REVIEW_ACTIONS = new Set(['opened', 'synchronize', 'ready_for_review']);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** A pull request that was opened, got new commits or left draft; drafts and closed pull requests are never reviewed. */
export const shouldAutoReview = (event: string, payload: unknown): boolean => {
  if (event !== 'pull_request' || !isRecord(payload)) return false;
  const action = payload.action;
  if (typeof action !== 'string' || !AUTO_REVIEW_ACTIONS.has(action)) return false;
  const pr = payload.pull_request;
  if (!isRecord(pr)) return false;
  return pr.draft !== true && pr.state !== 'closed' && pr.merged !== true;
};
