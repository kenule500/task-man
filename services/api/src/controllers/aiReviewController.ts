import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { body, validationResult } from 'express-validator';
import AiReview, { type IAiReview } from '../models/aiReviewModel.js';
import Task from '../models/taskModel.js';
import Workspace, { IWorkspace } from '../models/workspaceModel.js';
import { recordActivity } from '../utils/activity.js';
import { readPlanConfig } from '../utils/ai/plan/config.js';
import { countPlansUsedToday } from '../utils/ai/plan/service.js';
import { testAiConnection } from '../utils/ai/provider.js';
import { AI_PROVIDER_IDS, AI_PROVIDER_PRESETS, normalizeBaseURL, type AiProviderId } from '../utils/ai/providers.js';
import { AiQueueError, countUsedToday, queueReview, runInBackground, runReview } from '../utils/ai/reviewService.js';
import { resolveSafeEndpoint, UnsafeEndpointError } from '../utils/ai/urlGuard.js';
import { resolveWorkspaceAiConfig, type WorkspaceAiSettings } from '../utils/ai/workspaceConfig.js';
import { decryptSecret, encryptSecret } from '../utils/secretBox.js';

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
    const stored = await Workspace.findById(workspace._id).select('+ai.apiKeyEncrypted').lean();
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
const loadWorkspaceSettings = async (workspaceId: Id) => Workspace.findById(workspaceId)
  .select('+ai.apiKeyEncrypted +integrations.github.accessTokenEncrypted')
  .populate('ai.configuredBy', 'name')
  .lean();

/** Settings view. Never carries the key or the GitHub token, only whether one is saved. */
const settingsView = async (req: Request) => {
  const workspace = workspaceOf(req);
  const stored = await loadWorkspaceSettings(workspace._id as Id);
  const config = resolveWorkspaceAiConfig(String(workspace._id), stored?.ai as WorkspaceAiSettings | undefined);
  const ai = stored?.ai as WorkspaceAiSettings | undefined;
  const planConfig = readPlanConfig();
  const canManage = (req.permissions ?? []).includes('settings:manage');
  return {
    available: config.available,
    provider: config.provider,
    problem: config.problem,
    enabled: ai?.enabled === true,
    autoReview: ai?.autoReview === true,
    model: config.model,
    dailyLimit: config.limits.dailyLimit,
    usedToday: await countUsedToday(workspace._id as Id),
    githubTokenSet: Boolean(stored?.integrations?.github?.accessTokenEncrypted),
    // Project plans generated from documents have their own daily limit
    plan: {
      dailyLimit: planConfig.dailyLimit,
      usedToday: await countPlansUsedToday(workspace._id as Id),
      maxChars: planConfig.maxChars,
      maxBytes: planConfig.maxBytes,
    },
    // Endpoint/key metadata is only for members who may change it.
    ...(canManage ? {
      config: {
        keySet: config.keySet,
        keyHint: config.keyHint,
        baseURL: config.baseURL,
        configuredAt: ai?.configuredAt ?? null,
        configuredBy: requesterView(ai?.configuredBy),
        lastTestedAt: ai?.lastTestedAt ?? null,
        lastTestStatus: ai?.lastTestStatus ?? null,
        lastTestCode: ai?.lastTestCode ?? null,
      },
    } : {}),
  };
};

interface ProviderCandidate {
  settings: WorkspaceAiSettings;
  apiKeyEncrypted: string;
  keyHint: string;
  keyChanged: boolean;
}

interface CandidateFailure {
  status: number;
  code: string;
  message: string;
}

const candidateFailure = (status: number, code: string, message: string): CandidateFailure => ({ status, code, message });

const endpointFailure = (error: unknown): CandidateFailure | null => {
  if (!(error instanceof UnsafeEndpointError)) return null;
  return candidateFailure(400, error.code, error.message);
};

/**
 * Validates the provider form and returns the values to store/test. It never returns the plaintext key:
 * the encrypted value and the last-four hint are what leave this function.
 */
const providerCandidate = async (
  workspaceId: Id,
  stored: { ai?: WorkspaceAiSettings } | null,
  input: Record<string, unknown>,
): Promise<ProviderCandidate | CandidateFailure> => {
  const requested = typeof input.provider === 'string' ? input.provider.trim() : '';
  if (!(AI_PROVIDER_IDS as readonly string[]).includes(requested)) {
    return candidateFailure(400, 'PROVIDER_UNKNOWN', 'Choose a supported AI provider.');
  }
  const provider = requested as AiProviderId;
  const preset = AI_PROVIDER_PRESETS[provider];
  const rawBaseURL = provider === 'custom' ? String(input.baseURL ?? '') : preset.baseURL;
  const baseURL = normalizeBaseURL(rawBaseURL);
  if (!baseURL) {
    return candidateFailure(400, 'BASE_URL_INVALID', 'The AI endpoint must be a valid HTTPS URL without credentials, query or fragment.');
  }
  if (provider === 'custom') {
    try {
      await resolveSafeEndpoint(baseURL);
    } catch (error) {
      const failure = endpointFailure(error);
      if (failure) return failure;
      throw error;
    }
  }

  const model = (typeof input.model === 'string' ? input.model.trim() : '') || preset.model;
  if (!model) return candidateFailure(400, 'MODEL_MISSING', 'A custom endpoint needs a model.');

  const suppliedKey = typeof input.apiKey === 'string' ? input.apiKey.trim() : '';
  // A saved key may only be reused for the very same destination. Re-pointing an existing key at a
  // new endpoint would hand its secret to whoever controls that host, so a changed URL needs a new key.
  const storedBaseURL = normalizeBaseURL(String(stored?.ai?.baseURL ?? ''));
  const sameDestination = stored?.ai?.provider === provider && storedBaseURL === baseURL;
  let apiKeyEncrypted = sameDestination ? String(stored?.ai?.apiKeyEncrypted ?? '') : '';
  let keyHint: string;
  if (suppliedKey) {
    // Bound to the workspace id, so a ciphertext copied to another workspace cannot be decrypted.
    apiKeyEncrypted = encryptSecret(suppliedKey, String(workspaceId));
    keyHint = suppliedKey.slice(-4);
  } else if (apiKeyEncrypted) {
    try {
      keyHint = decryptSecret(apiKeyEncrypted, String(workspaceId)).trim().slice(-4);
    } catch {
      return candidateFailure(400, 'KEY_UNREADABLE', 'The saved key cannot be read. Replace it.');
    }
  } else {
    return candidateFailure(400, 'KEY_MISSING', 'Enter an API key for this provider.');
  }

  return {
    settings: { provider, baseURL, model, apiKeyEncrypted, keyHint },
    apiKeyEncrypted,
    keyHint,
    keyChanged: Boolean(suppliedKey),
  };
};

export const validateAiProvider = [
  body('provider').isString().trim().isIn(AI_PROVIDER_IDS as unknown as string[]).withMessage('Choose a supported AI provider'),
  body('apiKey').optional({ values: 'falsy' }).isString().trim().isLength({ max: 512 }).withMessage('The API key is too long'),
  body('model').optional({ values: 'falsy' }).isString().trim().isLength({ max: 120 }).withMessage('The model name is too long'),
  body('baseURL').optional({ values: 'falsy' }).isString().trim().isLength({ max: 2048 }).withMessage('The endpoint is too long'),
  body().custom((value: unknown) => {
    if (!value || typeof value !== 'object') throw new Error('Choose a provider');
    const input = value as Record<string, unknown>;
    if (input.provider === 'custom' && !String(input.baseURL ?? '').trim()) throw new Error('A custom endpoint needs an HTTPS base URL');
    return true;
  }),
];

export const validateAiProviderTest = [
  body('provider').optional({ values: 'falsy' }).isString().trim().isIn(AI_PROVIDER_IDS as unknown as string[]).withMessage('Choose a supported AI provider'),
  body('apiKey').optional({ values: 'falsy' }).isString().trim().isLength({ max: 512 }).withMessage('The API key is too long'),
  body('model').optional({ values: 'falsy' }).isString().trim().isLength({ max: 120 }).withMessage('The model name is too long'),
  body('baseURL').optional({ values: 'falsy' }).isString().trim().isLength({ max: 2048 }).withMessage('The endpoint is too long'),
  body().custom((value: unknown) => {
    if (!value || typeof value !== 'object') return true;
    const input = value as Record<string, unknown>;
    const entered = ['provider', 'apiKey', 'model', 'baseURL'].some(key => typeof input[key] === 'string' && String(input[key]).trim() !== '');
    if (entered && !String(input.provider ?? '').trim()) throw new Error('Choose a provider to test the entered values');
    return true;
  }),
];

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

    // Turning the feature on is only possible once the workspace has a usable provider and key.
    if (req.body.enabled === true && !before.available) {
      res.status(400).json({
        message: 'Save a provider and API key before turning AI code review on.',
        code: 'AI_NOT_CONFIGURED',
      });
      return;
    }
    const enabledAfter = typeof req.body.enabled === 'boolean' ? req.body.enabled : before.enabled;
    if (req.body.autoReview === true && (!before.available || !enabledAfter)) {
      res.status(400).json({
        message: 'Turn AI code review on and save a provider before enabling automatic reviews.',
        code: 'AI_NOT_CONFIGURED',
      });
      return;
    }

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

// @route PUT /api/workspaces/:slug/ai/provider (settings:manage, never an API token) -> the settings view
export const saveAiProvider = async (req: Request, res: Response): Promise<void> => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array(), message: errors.array()[0]?.msg });
    return;
  }
  try {
    const workspace = workspaceOf(req);
    const workspaceId = workspace._id as Id;
    const stored = await Workspace.findById(workspaceId).select('+ai.apiKeyEncrypted').lean();
    const candidate = await providerCandidate(workspaceId, stored, req.body ?? {});
    if (!('settings' in candidate)) {
      res.status(candidate.status).json({ message: candidate.message, code: candidate.code });
      return;
    }

    const existing = stored?.ai as WorkspaceAiSettings | undefined;
    // A first configuration must never resume a previous consent: both switches start off.
    const firstConfiguration = !existing?.provider || !existing?.apiKeyEncrypted;
    const set: Record<string, unknown> = {
      'ai.provider': candidate.settings.provider,
      'ai.baseURL': candidate.settings.baseURL,
      'ai.model': candidate.settings.model,
      'ai.apiKeyEncrypted': candidate.apiKeyEncrypted,
      'ai.keyHint': candidate.keyHint,
      'ai.configuredAt': new Date(),
      ...(firstConfiguration ? { 'ai.enabled': false, 'ai.autoReview': false } : {}),
    };
    if (req.user?._id) set['ai.configuredBy'] = req.user._id;

    await Workspace.updateOne({ _id: workspaceId }, {
      $set: set,
      $unset: { 'ai.lastTestedAt': '', 'ai.lastTestStatus': '', 'ai.lastTestCode': '' },
    });
    await recordActivity(req, {
      action: 'ai.settings_updated',
      summary: 'AI code review provider',
      changes: [
        { field: 'provider', from: existing?.provider ?? 'none', to: String(candidate.settings.provider) },
        { field: 'model', from: existing?.model || 'none', to: candidate.settings.model },
        {
          field: 'apiKey',
          from: existing?.apiKeyEncrypted ? 'set' : 'none',
          to: candidate.keyChanged ? 'replaced' : 'kept',
        },
      ],
    });
    res.status(200).json(await settingsView(req));
  } catch (error) {
    failure(res, error, 'saveAiProvider');
  }
};

// @route DELETE /api/workspaces/:slug/ai/provider (settings:manage, never an API token) -> the settings view
export const removeAiProvider = async (req: Request, res: Response): Promise<void> => {
  try {
    const workspace = workspaceOf(req);
    const workspaceId = workspace._id as Id;
    const stored = await Workspace.findById(workspaceId).select('+ai.apiKeyEncrypted').lean();
    const existing = stored?.ai as WorkspaceAiSettings | undefined;

    if (existing?.provider || existing?.apiKeyEncrypted) {
      await Workspace.updateOne({ _id: workspaceId }, {
        $set: { 'ai.enabled': false, 'ai.autoReview': false },
        $unset: {
          'ai.provider': '',
          'ai.baseURL': '',
          'ai.model': '',
          'ai.apiKeyEncrypted': '',
          'ai.keyHint': '',
          'ai.configuredAt': '',
          'ai.configuredBy': '',
          'ai.lastTestedAt': '',
          'ai.lastTestStatus': '',
          'ai.lastTestCode': '',
        },
      });
      await recordActivity(req, {
        action: 'ai.settings_updated',
        summary: 'AI code review provider',
        changes: [
          { field: 'provider', from: existing.provider ?? 'none', to: 'none' },
          { field: 'model', from: existing.model || 'none', to: 'none' },
          { field: 'apiKey', from: existing.apiKeyEncrypted ? 'set' : 'none', to: 'cleared' },
        ],
      });
    }
    res.status(200).json(await settingsView(req));
  } catch (error) {
    failure(res, error, 'removeAiProvider');
  }
};

// @route POST /api/workspaces/:slug/ai/provider/test { provider?, baseURL?, model?, apiKey? } (settings:manage)
export const testAiProvider = async (req: Request, res: Response): Promise<void> => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array(), message: errors.array()[0]?.msg });
    return;
  }
  try {
    const workspace = workspaceOf(req);
    const workspaceId = workspace._id as Id;
    const stored = await Workspace.findById(workspaceId).select('+ai.apiKeyEncrypted').lean();
    const entered = typeof req.body?.provider === 'string' && req.body.provider.trim() !== '';
    let settings = stored?.ai as WorkspaceAiSettings | undefined;

    if (entered) {
      const candidate = await providerCandidate(workspaceId, stored, req.body ?? {});
      if (!('settings' in candidate)) {
        res.status(candidate.status).json({ message: candidate.message, code: candidate.code });
        return;
      }
      settings = candidate.settings;
    }

    const config = resolveWorkspaceAiConfig(String(workspaceId), settings);
    if (!config.available) {
      res.status(400).json({
        message: 'The AI configuration is not complete enough to test. Save a provider and key first.',
        code: config.problem ?? 'AI_NOT_CONFIGURED',
      });
      return;
    }

    const result = await testAiConnection(config);
    const testedAt = new Date();
    if (!entered && stored?.ai?.provider) {
      await Workspace.updateOne({ _id: workspaceId }, {
        $set: {
          'ai.lastTestedAt': testedAt,
          'ai.lastTestStatus': result.ok ? 'success' : 'failed',
          'ai.lastTestCode': result.code.slice(0, 40),
        },
      });
    }
    res.status(200).json({ ok: result.ok, code: result.code, testedAt });
  } catch (error) {
    failure(res, error, 'testAiProvider');
  }
};
