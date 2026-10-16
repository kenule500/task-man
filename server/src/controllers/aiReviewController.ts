import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { body, validationResult } from 'express-validator';
import AiReview, { type IAiReview } from '../models/aiReviewModel.js';
import Task from '../models/taskModel.js';
import Workspace, { IWorkspace } from '../models/workspaceModel.js';
import { recordActivity } from '../utils/activity.js';
import { readAiConfig } from '../utils/ai/config.js';
import { AiQueueError, countUsedToday, queueReview, runInBackground, runReview } from '../utils/ai/reviewService.js';
import { encryptSecret } from '../utils/secretBox.js';

const HISTORY_LIMIT = 10;
const GITHUB_TOKEN = /^[A-Za-z0-9_-]{20,255}$/;

type Id = mongoose.Types.ObjectId;
type ReviewLike = Pick<IAiReview, '_id' | 'task' | 'pr' | 'status' | 'verdict' | 'summary' | 'criteriaSource' | 'counts' | 'truncated'
  | 'omittedFiles' | 'model' | 'usage' | 'error' | 'createdAt' | 'startedAt' | 'completedAt'> & {
  criteria?: IAiReview['criteria'];
  issues?: IAiReview['issues'];
  requestedBy?: unknown;
};

const workspaceOf = (req: Request): IWorkspace => req.workspace as IWorkspace;

const requesterView = (value: unknown): { _id: string; name: string } | null => {
  if (value && typeof value === 'object' && 'name' in value) {
    const user = value as { _id: unknown; name: string };
    return { _id: String(user._id), name: user.name };
  }
  return value ? { _id: String(value), name: '' } : null;
};

/** A review as the API returns it. The list leaves out the long parts (criteria, issues); the detail route has them. */
export const reviewView = (review: ReviewLike, detail: boolean) => ({
  _id: String(review._id),
  task: String(review.task),
  pr: review.pr,
  status: review.status,
  verdict: review.verdict,
  summary: review.summary,
  criteriaSource: review.criteriaSource,
  counts: review.counts,
  truncated: review.truncated,
  omittedFiles: review.omittedFiles,
  model: review.model,
  usage: review.usage,
  error: review.error,
  requestedBy: requesterView(review.requestedBy),
  createdAt: review.createdAt,
  startedAt: review.startedAt ?? null,
  completedAt: review.completedAt ?? null,
  ...(detail ? { criteria: review.criteria ?? [], issues: review.issues ?? [] } : {}),
});

const failure = (res: Response, error: unknown, context: string): void => {
  if (error instanceof AiQueueError) {
    res.status(error.status).json({ message: error.message, code: error.code });
    return;
  }
  console.error(`${context} error:`, (error as Error).message);
  res.status(500).json({ message: 'Server error' });
};

const findTask = async (req: Request) => {
  const id = String(req.params.id);
  if (!mongoose.isValidObjectId(id)) return null;
  return Task.findOne({ _id: id, workspace: workspaceOf(req)._id });
};

// ================================================================
// Reviews of a task
// ================================================================
export const validateRunReview = [
  body('prUrl').optional({ values: 'null' }).isString().withMessage('prUrl must be text').isLength({ max: 300 }).withMessage('prUrl is too long'),
];

// @route POST /api/workspaces/:slug/tasks/:id/ai-review { prUrl? } (tasks:write) -> 202 with the queued review
export const runAiReview = async (req: Request, res: Response): Promise<void> => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }
  try {
    const task = await findTask(req);
    if (!task) {
      res.status(404).json({ message: 'Task not found' });
      return;
    }
    const workspace = workspaceOf(req);
    const stored = await Workspace.findById(workspace._id).select('ai').lean();
    const review = await queueReview({
      workspaceId: workspace._id as Id,
      settings: stored?.ai,
      task,
      prUrl: typeof req.body?.prUrl === 'string' ? req.body.prUrl : undefined,
      requestedBy: req.user?._id as Id,
    });
    // The work continues after the response (kept alive by waitUntil on Vercel)
    runInBackground(runReview(review._id as Id));
    res.status(202).json(reviewView({ ...review.toObject(), requestedBy: req.user ? { _id: req.user._id, name: req.user.name } : null }, false));
  } catch (error) {
    failure(res, error, 'runAiReview');
  }
};

// @route GET /api/workspaces/:slug/tasks/:id/ai-reviews (tasks:read) -> the latest 10, newest first
export const listAiReviews = async (req: Request, res: Response): Promise<void> => {
  try {
    const task = await findTask(req);
    if (!task) {
      res.status(404).json({ message: 'Task not found' });
      return;
    }
    const reviews = await AiReview.find({ workspace: workspaceOf(req)._id, task: task._id })
      .select('-criteria -issues')
      .sort({ createdAt: -1 })
      .limit(HISTORY_LIMIT)
      .populate('requestedBy', 'name')
      .lean();
    res.status(200).json(reviews.map(review => reviewView(review as unknown as ReviewLike, false)));
  } catch (error) {
    failure(res, error, 'listAiReviews');
  }
};

// @route GET /api/workspaces/:slug/tasks/:id/ai-reviews/:reviewId (tasks:read) -> the full review
export const getAiReview = async (req: Request, res: Response): Promise<void> => {
  try {
    const task = await findTask(req);
    const reviewId = String(req.params.reviewId);
    const review = task && mongoose.isValidObjectId(reviewId)
      ? await AiReview.findOne({ _id: reviewId, workspace: workspaceOf(req)._id, task: task._id }).populate('requestedBy', 'name').lean()
      : null;
    if (!task || !review) {
      res.status(404).json({ message: 'Review not found' });
      return;
    }
    res.status(200).json(reviewView(review as unknown as ReviewLike, true));
  } catch (error) {
    failure(res, error, 'getAiReview');
  }
};

// ================================================================
// Workspace settings
// ================================================================
/** Settings view. Never carries the GitHub token, only whether one is saved. */
const settingsView = async (req: Request) => {
  const workspace = workspaceOf(req);
  const stored = await Workspace.findById(workspace._id).select('ai +integrations.github.accessTokenEncrypted').lean();
  const config = readAiConfig();
  return {
    available: config.available,
    enabled: stored?.ai?.enabled === true,
    autoReview: stored?.ai?.autoReview === true,
    model: config.model,
    dailyLimit: config.dailyLimit,
    usedToday: await countUsedToday(workspace._id as Id),
    githubTokenSet: Boolean(stored?.integrations?.github?.accessTokenEncrypted),
  };
};

// @route GET /api/workspaces/:slug/ai (tasks:read)
export const getAiSettings = async (req: Request, res: Response): Promise<void> => {
  try {
    res.status(200).json(await settingsView(req));
  } catch (error) {
    failure(res, error, 'getAiSettings');
  }
};

export const validateAiSettings = [
  body('enabled').optional().isBoolean({ strict: true }).withMessage('enabled must be true or false'),
  body('autoReview').optional().isBoolean({ strict: true }).withMessage('autoReview must be true or false'),
  body('githubToken').optional().custom((value: unknown) => {
    // null or an empty string removes the saved token
    if (value === null || value === '') return true;
    if (typeof value !== 'string' || !GITHUB_TOKEN.test(value.trim())) throw new Error('That does not look like a GitHub token');
    return true;
  }),
  body().custom((value: unknown) => {
    const keys = value && typeof value === 'object' ? Object.keys(value) : [];
    if (!keys.some(key => ['enabled', 'autoReview', 'githubToken'].includes(key))) throw new Error('Nothing to update');
    return true;
  }),
];

// @route PATCH /api/workspaces/:slug/ai { enabled?, autoReview?, githubToken? } (settings:manage, never an API token)
export const updateAiSettings = async (req: Request, res: Response): Promise<void> => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }
  try {
    const workspace = workspaceOf(req);
    const before = await settingsView(req);
    const set: Record<string, unknown> = {};
    const unset: Record<string, ''> = {};
    const changes: { field: string; from?: string; to?: string }[] = [];

    if (typeof req.body.enabled === 'boolean' && req.body.enabled !== before.enabled) {
      set['ai.enabled'] = req.body.enabled;
      changes.push({ field: 'enabled', from: String(before.enabled), to: String(req.body.enabled) });
    }
    if (typeof req.body.autoReview === 'boolean' && req.body.autoReview !== before.autoReview) {
      set['ai.autoReview'] = req.body.autoReview;
      changes.push({ field: 'autoReview', from: String(before.autoReview), to: String(req.body.autoReview) });
    }
    if ('githubToken' in req.body) {
      const token = typeof req.body.githubToken === 'string' ? req.body.githubToken.trim() : '';
      if (token) {
        // Bound to the workspace id, so the value cannot be copied to another workspace
        set['integrations.github.accessTokenEncrypted'] = encryptSecret(token, String(workspace._id));
        changes.push({ field: 'githubToken', to: 'set' });
      } else if (before.githubTokenSet) {
        unset['integrations.github.accessTokenEncrypted'] = '';
        changes.push({ field: 'githubToken', from: 'set', to: 'cleared' });
      }
    }

    if (changes.length > 0) {
      await Workspace.updateOne({ _id: workspace._id }, {
        ...(Object.keys(set).length > 0 ? { $set: set } : {}),
        ...(Object.keys(unset).length > 0 ? { $unset: unset } : {}),
      });
      await recordActivity(req, { action: 'ai.settings_updated', summary: 'AI code review', changes });
    }
    res.status(200).json(await settingsView(req));
  } catch (error) {
    failure(res, error, 'updateAiSettings');
  }
};
