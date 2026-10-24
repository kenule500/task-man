import mongoose from 'mongoose';
import { waitUntil } from '@vercel/functions';
import Activity from '../../models/activityModel.js';
import AiReview, { MAX_OMITTED_FILES, type IAiReview } from '../../models/aiReviewModel.js';
import Notification from '../../models/notificationModel.js';
import Project from '../../models/projectModel.js';
import Task, { type ITask } from '../../models/taskModel.js';
import User from '../../models/userModel.js';
import Workspace from '../../models/workspaceModel.js';
import { decryptSecret } from '../secretBox.js';
import { isPushConfigured, pushSentence, sendPushToUser } from '../webPush.js';
import { selectDiff } from './diffSelect.js';
import { fetchPullRequest, parsePrUrl, type PrRef } from './githubPr.js';
import { reviewWithModel } from './provider.js';
import { countResults, finalizeReview } from './schema.js';
import { AiReviewError, type ReviewModelInput } from './types.js';
import { resolveWorkspaceAiConfig, type WorkspaceAiSettings } from './workspaceConfig.js';

// Queues and runs AI code reviews. Used by the review routes and by the GitHub webhook (auto review).

type Id = mongoose.Types.ObjectId;

/** A queued or running review older than this has been abandoned (the function was stopped); it no longer blocks the task. */
export const STALE_AFTER_MS = 10 * 60 * 1000;
const SUMMARY_NOTE = 'No explicit acceptance criteria were set, so this review used the ticket description and checklist. ';
const MAX_SUMMARY = 2000;

/** A refusal with an HTTP status and a stable code the web app can react to. */
export class AiQueueError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
    this.name = 'AiQueueError';
  }
}

export const startOfUtcDay = (now = new Date()): Date =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

/** Reviews that cost the workspace quota today (a review that failed before reaching the model does not). */
export const countUsedToday = (workspaceId: Id | string, now = new Date()): Promise<number> =>
  AiReview.countDocuments({
    workspace: workspaceId,
    createdAt: { $gte: startOfUtcDay(now) },
    $or: [{ status: { $ne: 'failed' } }, { 'usage.inputTokens': { $gt: 0 } }],
  });

/** Runs `work` after the response: Vercel keeps the function alive for it (waitUntil); elsewhere it is a plain background promise. */
export const runInBackground = (work: Promise<unknown>): void => {
  const guarded = work.catch(error => console.error('ai review background error:', (error as Error).message));
  try {
    waitUntil(guarded);
  } catch {
    // Not on Vercel: the promise simply keeps running
  }
};

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ----------------------------------------------------------------
// Choosing the pull request
// ----------------------------------------------------------------
export interface LinkLike {
  kind: string;
  url: string;
  title?: string;
  sha?: string;
  state?: string;
  updatedAt?: Date;
}

/** The pull request to review for a task: an open linked one first, then the most recently updated. */
export const pickLinkedPullRequest = (links: LinkLike[] | undefined): { ref: PrRef; title: string; sha: string } | null => {
  const candidates = (links ?? [])
    .filter(link => link.kind === 'pull_request')
    .map(link => ({ link, ref: parsePrUrl(link.url) }))
    .filter((item): item is { link: LinkLike; ref: PrRef } => item.ref !== null)
    .sort((a, b) => {
      const open = Number(b.link.state === 'open') - Number(a.link.state === 'open');
      return open || new Date(b.link.updatedAt ?? 0).getTime() - new Date(a.link.updatedAt ?? 0).getTime();
    });
  const best = candidates[0];
  return best ? { ref: best.ref, title: best.link.title ?? '', sha: best.link.sha ?? '' } : null;
};

// ----------------------------------------------------------------
// Queueing
// ----------------------------------------------------------------
export interface QueueInput {
  workspaceId: Id;
  /** `ai` settings of the workspace as stored, including the encrypted key when selected. */
  settings: WorkspaceAiSettings | undefined;
  task: Pick<ITask, '_id' | 'links'>;
  prUrl?: string;
  requestedBy: Id | null;
}

/**
 * Checks everything that can refuse a review (feature off, no pull request, one already running, daily limit)
 * and stores a queued review. Throws `AiQueueError`.
 */
export const queueReview = async (input: QueueInput): Promise<IAiReview> => {
  const config = resolveWorkspaceAiConfig(String(input.workspaceId), input.settings);
  if (!config.available) {
    throw new AiQueueError(503, 'AI_NOT_CONFIGURED', 'AI code review is not configured for this workspace. An owner or admin can set it up in the workspace settings.');
  }
  if (input.settings?.enabled !== true) throw new AiQueueError(503, 'AI_DISABLED', 'The AI code review is turned off for this workspace. An administrator can turn it on in the settings.');

  let target: { ref: PrRef; title: string; sha: string } | null;
  if (input.prUrl !== undefined && input.prUrl !== '') {
    const ref = parsePrUrl(input.prUrl);
    if (!ref) throw new AiQueueError(400, 'INVALID_PR_URL', 'The pull request link must look like https://github.com/owner/repo/pull/123.');
    const linked = (input.task.links ?? []).find(link => link.url === ref.url);
    target = { ref, title: linked?.title ?? '', sha: linked?.sha ?? '' };
  } else {
    target = pickLinkedPullRequest(input.task.links as LinkLike[] | undefined);
    if (!target) throw new AiQueueError(400, 'NO_PULL_REQUEST', 'This task has no linked pull request. Link one from GitHub or paste its address.');
  }

  await AiReview.updateMany(
    { task: input.task._id, status: { $in: ['queued', 'running'] }, createdAt: { $lt: new Date(Date.now() - STALE_AFTER_MS) } },
    { $set: { status: 'failed', active: false, error: 'The review did not finish and was stopped.', completedAt: new Date() } },
  );
  if (await AiReview.exists({ task: input.task._id, status: { $in: ['queued', 'running'] } })) {
    throw new AiQueueError(409, 'REVIEW_IN_PROGRESS', 'A review of this task is already running.');
  }
  if (await countUsedToday(input.workspaceId) >= config.limits.dailyLimit) {
    throw new AiQueueError(429, 'AI_DAILY_LIMIT', `This workspace has used its ${config.limits.dailyLimit} AI reviews for today. The limit resets at midnight UTC.`);
  }

  try {
    return await AiReview.create({
    workspace: input.workspaceId,
    task: input.task._id,
    pr: { repo: target.ref.fullName, number: target.ref.number, url: target.ref.url, title: target.title.slice(0, 300), headSha: target.sha },
    status: 'queued',
    model: config.model,
    requestedBy: input.requestedBy,
    });
  } catch (error) {
    // The unique index lost a race with a simultaneous request for the same task
    if ((error as { code?: number }).code === 11000) {
      throw new AiQueueError(409, 'REVIEW_IN_PROGRESS', 'A review of this task is already running.');
    }
    throw error;
  }
};

/** Auto review from the webhook: same checks, but silent (returns null instead of throwing) and once per head commit. */
export const queueAutoReview = async (input: Omit<QueueInput, 'prUrl' | 'requestedBy'> & { prUrl: string; headSha: string }): Promise<IAiReview | null> => {
  if (input.headSha && await AiReview.exists({ task: input.task._id, 'pr.url': input.prUrl, 'pr.headSha': input.headSha, status: { $ne: 'failed' } })) return null;
  try {
    return await queueReview({ ...input, requestedBy: null });
  } catch (error) {
    if (error instanceof AiQueueError) return null;
    throw error;
  }
};

// ----------------------------------------------------------------
// Running
// ----------------------------------------------------------------
/** Whether the workspace's GitHub token may be used for this repository: only repositories its tasks already link to. */
const mayUseToken = async (workspaceId: Id, repo: string): Promise<boolean> =>
  Boolean(await Task.exists({
    workspace: workspaceId,
    links: { $elemMatch: { repo: { $regex: `^${escapeRegExp(repo)}$`, $options: 'i' } } },
  }));

const taskKey = async (task: Pick<ITask, 'number' | 'project'>, workspaceId: Id): Promise<string> => {
  const project = task.project ? await Project.findOne({ workspace: workspaceId, name: task.project }).select('key').lean() : null;
  return task.number ? `${project?.key ?? 'TM'}-${task.number}` : (project?.key ?? 'TM');
};

const failReview = async (reviewId: Id, message: string): Promise<void> => {
  await AiReview.updateOne(
    { _id: reviewId, status: { $in: ['queued', 'running'] } },
    { $set: { status: 'failed', active: false, error: message.slice(0, 500), completedAt: new Date() } },
  );
};

const tellRequester = async (review: IAiReview, workspaceSlug: string, taskTitle: string): Promise<void> => {
  if (!review.requestedBy) return;
  try {
    await Notification.create({
      user: review.requestedBy,
      workspace: review.workspace,
      actor: review.requestedBy,
      type: 'ai.review_completed',
      task: review.task,
      summary: taskTitle.slice(0, 140),
    });
    const user = await User.findById(review.requestedBy).select('notifications').lean();
    if (isPushConfigured() && user?.notifications?.push !== false) {
      await sendPushToUser(String(review.requestedBy), {
        title: 'TaskMan',
        body: pushSentence('ai.review_completed', '', taskTitle),
        url: `/${workspaceSlug}/tasks?task=${String(review.task)}`,
        tag: `ai-review:${String(review._id)}`,
      });
    }
  } catch (error) {
    console.error('ai review notify error:', (error as Error).message);
  }
};

/** Does the whole review for a queued one. Never throws: problems end up on the review as a safe message. */
export const runReview = async (reviewId: Id | string): Promise<void> => {
  const review = await AiReview.findOneAndUpdate(
    { _id: reviewId, status: 'queued' },
    { $set: { status: 'running', startedAt: new Date() } },
    { returnDocument: 'after' },
  );
  if (!review) return;

  try {
    const workspace = await Workspace.findById(review.workspace).select('slug +ai.apiKeyEncrypted +integrations.github.accessTokenEncrypted');
    const task = await Task.findOne({ _id: review.task, workspace: review.workspace });
    if (!workspace || !task) throw new AiReviewError('The task no longer exists.', 'TASK_GONE');
    const config = resolveWorkspaceAiConfig(String(workspace._id), workspace.ai);
    if (workspace.ai?.enabled !== true) throw new AiReviewError('The AI code review was turned off before it started.', 'AI_DISABLED');
    if (!config.available) throw new AiReviewError('AI code review is no longer configured for this workspace.', 'AI_NOT_CONFIGURED');

    const ref = parsePrUrl(review.pr.url);
    if (!ref) throw new AiReviewError('The pull request link is not valid.', 'INVALID_PR_URL');

    let token: string | undefined;
    const box = workspace.integrations?.github?.accessTokenEncrypted;
    if (box && await mayUseToken(workspace._id as Id, ref.fullName)) {
      try {
        token = decryptSecret(box, String(workspace._id));
      } catch {
        console.error('ai review: the stored GitHub token could not be decrypted');
      }
    }

    const pr = await fetchPullRequest(ref, token);
    if (pr.files.length === 0) throw new AiReviewError('The pull request has no changed files to review.', 'EMPTY_PULL_REQUEST');

    const selection = selectDiff(pr.files, config.limits.maxDiffChars);
    const notFetched = Math.max(0, pr.changedFiles - pr.files.length);
    if (notFetched > 0) {
      selection.omittedFiles.push(`(+${notFetched} more files were not fetched)`);
      selection.truncated = true;
    }

    const explicit = (task.acceptanceCriteria ?? []).map(item => item.text);
    const criteria = explicit.length > 0 ? explicit : (task.checklist ?? []).map(item => item.text);
    const input: ReviewModelInput = {
      ticket: {
        key: await taskKey(task, workspace._id as Id),
        title: task.title,
        description: task.description,
        criteria,
        criteriaSource: explicit.length > 0 ? 'explicit' : 'derived',
      },
      pr: { title: pr.title, body: pr.body, repo: pr.repo, number: pr.number, headSha: pr.headSha, baseRef: pr.baseRef, headRef: pr.headRef },
      manifest: pr.files.map(file => ({ filename: file.filename, status: file.status, additions: file.additions, deletions: file.deletions })),
      selection,
    };

    const answer = await reviewWithModel(input, { config });
    const result = {
      ...finalizeReview(answer.output, { criteria, knownFiles: input.manifest.map(file => file.filename), truncated: selection.truncated }),
      model: answer.model,
      usage: answer.usage,
    };
    const summary = `${explicit.length > 0 ? '' : SUMMARY_NOTE}${result.summary}`.slice(0, MAX_SUMMARY);
    const omitted = selection.omittedFiles.length > MAX_OMITTED_FILES
      ? [...selection.omittedFiles.slice(0, MAX_OMITTED_FILES), `(+${selection.omittedFiles.length - MAX_OMITTED_FILES} more)`]
      : selection.omittedFiles;

    const saved = await AiReview.findOneAndUpdate(
      { _id: review._id, status: 'running' },
      {
        $set: {
          status: 'completed',
          active: false,
          verdict: result.verdict,
          summary,
          criteriaSource: input.ticket.criteriaSource,
          criteria: result.criteria,
          issues: result.issues,
          counts: countResults(result.criteria, result.issues),
          truncated: selection.truncated,
          omittedFiles: omitted,
          model: result.model,
          usage: result.usage,
          error: '',
          'pr.title': pr.title.slice(0, 300),
          'pr.headSha': pr.headSha,
          completedAt: new Date(),
        },
      },
      { returnDocument: 'after' },
    );
    if (!saved) return;

    try {
      await Activity.create({
        workspace: saved.workspace,
        actor: saved.requestedBy ?? undefined,
        action: 'ai.review_completed',
        summary: `${input.ticket.key} ${task.title}`.slice(0, 200),
        task: saved.task,
        changes: [{ field: 'verdict', to: result.verdict }],
      });
    } catch (error) {
      console.error('ai review activity error:', (error as Error).message);
    }
    await tellRequester(saved, workspace.slug, task.title);
  } catch (error) {
    if (!(error instanceof AiReviewError)) console.error('ai review error:', (error as Error).message);
    const message = error instanceof AiReviewError ? error.message : 'The review failed unexpectedly. Try again.';
    await failReview(review._id as Id, message);
  }
};
