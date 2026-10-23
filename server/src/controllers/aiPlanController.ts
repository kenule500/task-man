import { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';
import multer from 'multer';
import { body, validationResult } from 'express-validator';
import AiPlan, { type IAiPlan } from '../models/aiPlanModel.js';
import Workspace, { IWorkspace } from '../models/workspaceModel.js';
import { sanitizeFilename } from '../middleware/uploadMiddleware.js';
import { readPlanConfig } from '../utils/ai/plan/config.js';
import { createFromPlan as writePlan } from '../utils/ai/plan/create.js';
import { isDateKey, nextMonday } from '../utils/ai/plan/dates.js';
import { DocumentError, extractDocument } from '../utils/ai/plan/extract.js';
import {
  assertCanQueuePlan, assertPlanFeatureOn, createQueuedPlan, runPlan, type PlanOptionsInput,
} from '../utils/ai/plan/service.js';
import { countPlan, describePlanProblem, editedPlanSchema, finalizePlan, PLAN_LANGUAGES, type PlanLanguage } from '../utils/ai/plan/schema.js';
import { findTargetProject, resolveTargetProject, type PlanTarget } from '../utils/ai/plan/target.js';
import { shortenForModel } from '../utils/ai/plan/text.js';
import { AiQueueError, runInBackground } from '../utils/ai/reviewService.js';

type Id = mongoose.Types.ObjectId;

const HISTORY_LIMIT = 10;
const MAX_EXTRA_INSTRUCTIONS = 500;

const workspaceOf = (req: Request): IWorkspace => req.workspace as IWorkspace;
const userIdOf = (req: Request): Id => req.user?._id as Id;

/** A plan as the API returns it. The list leaves out the content (plan, preview); the detail route has them. */
export const planView = (plan: Pick<IAiPlan, '_id' | 'status' | 'source' | 'options' | 'model' | 'usage' | 'error' | 'errorCode' | 'projectId' | 'createdAt' | 'startedAt' | 'completedAt'>
  & { plan?: IAiPlan['plan']; createdBy?: unknown }, detail: boolean, targetProject: PlanTarget | null = null) => ({
  _id: String(plan._id),
  status: plan.status,
  source: detail ? plan.source : { ...plan.source, preview: undefined },
  options: plan.options,
  counts: plan.plan ? countPlan(plan.plan) : null,
  model: plan.model,
  usage: plan.usage,
  error: plan.error,
  errorCode: plan.errorCode,
  projectId: plan.projectId ? String(plan.projectId) : null,
  createdBy: plan.createdBy ? String(plan.createdBy) : undefined,
  createdAt: plan.createdAt,
  startedAt: plan.startedAt ?? null,
  completedAt: plan.completedAt ?? null,
  ...(detail ? { targetProject, plan: plan.plan ?? null } : {}),
});

const failure = (res: Response, error: unknown, context: string): void => {
  if (error instanceof DocumentError) {
    res.status(error.status).json({ message: error.message, code: error.code });
    return;
  }
  if (error instanceof AiQueueError) {
    const suggestion = (error as { suggestion?: string }).suggestion;
    res.status(error.status).json({ message: error.message, code: error.code, ...(suggestion ? { suggestion } : {}) });
    return;
  }
  console.error(`${context} error:`, (error as Error).message);
  res.status(500).json({ message: 'Server error' });
};

/** A plan of this workspace that the caller may see: their own, or any when they manage settings. */
const findPlan = async (req: Request, { ownOnly }: { ownOnly: boolean }): Promise<IAiPlan | null> => {
  const id = String(req.params.id);
  if (!mongoose.isValidObjectId(id)) return null;
  const plan = await AiPlan.findOne({ _id: new mongoose.Types.ObjectId(id), workspace: workspaceOf(req)._id, deletedAt: null });
  if (!plan) return null;
  const mine = String(plan.createdBy) === String(userIdOf(req));
  if (mine || (!ownOnly && (req.permissions ?? []).includes('settings:manage'))) return plan;
  return null;
};

// ================================================================
// Middleware of the upload route
// ================================================================
/** The caller must hold both permissions: creating the project (projects:write) and its tasks (tasks:write). */
export const requireTaskWrite = (req: Request, res: Response, next: NextFunction): void => {
  if (!(req.permissions ?? []).includes('tasks:write')) {
    res.status(403).json({ message: 'You need permission to create tasks' });
    return;
  }
  next();
};

/** Answers 503 before the file is read when AI is off, so nothing large is processed for nothing. */
export const ensurePlansEnabled = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const workspaceId = workspaceOf(req)._id as Id;
    const stored = await Workspace.findById(workspaceId).select('+ai.apiKeyEncrypted').lean();
    assertPlanFeatureOn(workspaceId, stored?.ai);
    next();
  } catch (error) {
    failure(res, error, 'ensurePlansEnabled');
  }
};

/** Parses one multipart "file" into req.file (memory). The limit is read per request so it can follow the environment. */
export const uploadPlanFile = (req: Request, res: Response, next: NextFunction): void => {
  const config = readPlanConfig();
  const upload = multer({
    storage: multer.memoryStorage(),
    defParamCharset: 'utf8',
    limits: { fileSize: config.maxBytes, files: 1, fields: 12, fieldSize: 4096, parts: 16 },
  }).single('file');
  upload(req, res, (error: unknown) => {
    if (!error) {
      next();
      return;
    }
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({ message: `The file is too large (the limit is ${Math.floor(config.maxBytes / 1024 / 1024)} MB).`, code: 'FILE_TOO_LARGE' });
      return;
    }
    res.status(400).json({ message: 'The upload could not be read. Send one file in the "file" field.', code: 'BAD_UPLOAD' });
  });
};

export const validateUploadPlan = [
  body('projectName').optional({ values: 'falsy' }).isString().trim().isLength({ max: 60 }).withMessage('The project name is too long (60 characters at most)'),
  body('projectKey').optional({ values: 'falsy' }).isString().trim().matches(/^[A-Za-z0-9]{2,6}$/).withMessage('The key must be 2 to 6 letters or digits'),
  body('sprintLengthWeeks').optional({ values: 'falsy' }).isInt({ min: 1, max: 4 }).withMessage('Sprints last 1 to 4 weeks'),
  body('startDate').optional({ values: 'falsy' }).custom(isDateKey).withMessage('The start date must look like 2030-01-31'),
  body('teamSize').optional({ values: 'falsy' }).isInt({ min: 1, max: 200 }).withMessage('The team size must be between 1 and 200'),
  body('extraInstructions').optional({ values: 'falsy' }).isString().isLength({ max: MAX_EXTRA_INSTRUCTIONS }).withMessage(`The notes are too long (${MAX_EXTRA_INSTRUCTIONS} characters at most)`),
  body('language').optional({ values: 'falsy' }).isIn(PLAN_LANGUAGES).withMessage('Choose English, French or Arabic'),
  body('targetProjectId').optional({ values: 'falsy' }).isString().trim().isMongoId().withMessage('Choose a valid project'),
];

export const validateCreateFromPlan = [
  // Absent = keep the stored destination, null = a new project, a string = that project
  body('targetProjectId').optional({ nullable: true }).isString().trim().isMongoId().withMessage('Choose a valid project'),
];

// ================================================================
// @route POST /api/workspaces/:slug/ai/plans (multipart: file + options) -> 202 with the queued plan
// ================================================================
export const uploadPlan = async (req: Request, res: Response): Promise<void> => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const targetInvalid = errors.array().some(error => (error as { path?: string }).path === 'targetProjectId');
    res.status(400).json({ errors: errors.array(), message: errors.array()[0]?.msg, ...(targetInvalid ? { code: 'TARGET_INVALID' } : {}) });
    return;
  }
  if (!req.file) {
    res.status(400).json({ message: 'Choose a PDF, DOCX, TXT or Markdown file to upload.', code: 'NO_FILE' });
    return;
  }
  try {
    const workspace = workspaceOf(req);
    const workspaceId = workspace._id as Id;
    const userId = userIdOf(req);
    const config = readPlanConfig();

    const stored = await Workspace.findById(workspaceId).select('+ai.apiKeyEncrypted').lean();
    const ai = await assertCanQueuePlan({ workspaceId, userId, settings: stored?.ai });

    const field = (name: string): string => (typeof req.body?.[name] === 'string' ? (req.body[name] as string).trim() : '');
    const targetProject = field('targetProjectId') ? await resolveTargetProject(workspaceId, field('targetProjectId')) : null;

    const fileName = sanitizeFilename(req.file.originalname);
    const extracted = await extractDocument(fileName, req.file.buffer);
    const shortened = shortenForModel(extracted.text, config.maxChars);

    const options: PlanOptionsInput = {
      projectName: field('projectName'),
      projectKey: field('projectKey').toUpperCase(),
      sprintLengthWeeks: Number.parseInt(field('sprintLengthWeeks'), 10) || 2,
      startDate: field('startDate') || nextMonday(),
      teamSize: Number.parseInt(field('teamSize'), 10) || null,
      extraInstructions: field('extraInstructions'),
      language: (PLAN_LANGUAGES as readonly string[]).includes(field('language')) ? field('language') as PlanLanguage : 'en',
      targetProjectId: targetProject ? new mongoose.Types.ObjectId(targetProject._id) : null,
    };

    const plan = await createQueuedPlan({
      workspaceId,
      userId,
      source: {
        fileName, mimeType: extracted.mimeType, size: req.file.size, chars: extracted.text.length, truncated: shortened.truncated, text: extracted.text,
      },
      options,
      model: ai.model,
    });
    // The work continues after the response (kept alive by waitUntil on Vercel); the text lives only in this closure
    runInBackground(runPlan(plan._id as Id, { text: shortened.text, truncated: shortened.truncated }));
    res.status(202).json(planView(plan.toObject(), true, targetProject));
  } catch (error) {
    failure(res, error, 'uploadPlan');
  }
};

// @route GET /api/workspaces/:slug/ai/plans (projects:read) -> the caller's latest plans, newest first
export const listPlans = async (req: Request, res: Response): Promise<void> => {
  try {
    const plans = await AiPlan.find({ workspace: workspaceOf(req)._id, createdBy: userIdOf(req), deletedAt: null })
      .select('-plan -source.preview')
      .sort({ createdAt: -1 })
      .limit(HISTORY_LIMIT)
      .lean();
    res.status(200).json(plans.map(plan => ({ ...planView(plan as unknown as IAiPlan, false), counts: null })));
  } catch (error) {
    failure(res, error, 'listPlans');
  }
};

// @route GET /api/workspaces/:slug/ai/plans/:id (projects:read; the owner, or settings:manage) -> status and plan, for polling
export const getPlan = async (req: Request, res: Response): Promise<void> => {
  try {
    const plan = await findPlan(req, { ownOnly: false });
    if (!plan) {
      res.status(404).json({ message: 'Plan not found' });
      return;
    }
    const targetProject = plan.options.targetProjectId
      ? await findTargetProject(plan.workspace, plan.options.targetProjectId)
      : null;
    res.status(200).json(planView(plan.toObject(), true, targetProject));
  } catch (error) {
    failure(res, error, 'getPlan');
  }
};

// @route PATCH /api/workspaces/:slug/ai/plans/:id { plan } (owner) -> the plan after the person's edits
export const updatePlan = async (req: Request, res: Response): Promise<void> => {
  try {
    const plan = await findPlan(req, { ownOnly: true });
    if (!plan) {
      res.status(404).json({ message: 'Plan not found' });
      return;
    }
    if (plan.status !== 'ready') {
      res.status(409).json({ message: 'Only a plan that is ready can be edited.', code: 'PLAN_NOT_READY' });
      return;
    }
    const parsed = editedPlanSchema.safeParse(req.body?.plan);
    if (!parsed.success) {
      res.status(400).json({ message: `The plan is not valid: ${describePlanProblem(parsed.error)}`, code: 'PLAN_INVALID' });
      return;
    }
    const content = finalizePlan(parsed.data, {
      startDate: plan.options.startDate,
      sprintLengthWeeks: plan.options.sprintLengthWeeks,
      keepDates: true,
    });
    const saved = await AiPlan.findOneAndUpdate(
      { _id: plan._id, workspace: plan.workspace, createdBy: plan.createdBy, status: 'ready', creating: { $ne: true } },
      { $set: { plan: content } },
      { returnDocument: 'after' },
    );
    if (!saved) {
      res.status(409).json({ message: 'The plan changed in the meantime. Reload it.', code: 'PLAN_NOT_READY' });
      return;
    }
    const targetProject = saved.options.targetProjectId
      ? await findTargetProject(saved.workspace, saved.options.targetProjectId)
      : null;
    res.status(200).json(planView(saved.toObject(), true, targetProject));
  } catch (error) {
    failure(res, error, 'updatePlan');
  }
};

// @route POST /api/workspaces/:slug/ai/plans/:id/create (owner; projects:write + tasks:write) -> 201 with the new project
export const createFromPlan = async (req: Request, res: Response): Promise<void> => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const targetInvalid = errors.array().some(error => (error as { path?: string }).path === 'targetProjectId');
    res.status(400).json({ errors: errors.array(), message: errors.array()[0]?.msg, ...(targetInvalid ? { code: 'TARGET_INVALID' } : {}) });
    return;
  }
  let claimed: IAiPlan | null = null;
  try {
    const existing = await findPlan(req, { ownOnly: true });
    if (!existing) {
      res.status(404).json({ message: 'Plan not found' });
      return;
    }
    // Absent = the destination stored at upload; null = a new project; a string = that project
    const hasOverride = req.body !== null && typeof req.body === 'object'
      && Object.prototype.hasOwnProperty.call(req.body, 'targetProjectId');
    const target: PlanTarget | null = hasOverride
      ? (req.body.targetProjectId === null ? null : await resolveTargetProject(existing.workspace, req.body.targetProjectId))
      : (existing.options.targetProjectId
        ? await resolveTargetProject(existing.workspace, existing.options.targetProjectId, { missingCode: 'TARGET_UNAVAILABLE', missingStatus: 409 })
        : null);

    // Claimed atomically, so a double click or two tabs cannot create the project twice
    claimed = await AiPlan.findOneAndUpdate(
      { _id: existing._id, workspace: existing.workspace, createdBy: existing.createdBy, status: 'ready', creating: { $ne: true }, deletedAt: null },
      { $set: { creating: true } },
      { returnDocument: 'after' },
    );
    if (!claimed) {
      res.status(409).json({
        message: existing.status === 'created' ? 'The project was already created from this plan.' : 'This plan is not ready to be created.',
        code: existing.status === 'created' ? 'PLAN_ALREADY_CREATED' : 'PLAN_NOT_READY',
      });
      return;
    }
    const created = await writePlan(req, claimed, target);
    await AiPlan.updateOne(
      { _id: claimed._id },
      {
        $set: {
          status: 'created',
          creating: false,
          projectId: new mongoose.Types.ObjectId(created.project._id),
          'options.targetProjectId': target ? new mongoose.Types.ObjectId(target._id) : null,
        },
      },
    );
    res.status(201).json(created);
  } catch (error) {
    if (claimed) await AiPlan.updateOne({ _id: claimed._id }, { $set: { creating: false } }).catch(() => undefined);
    failure(res, error, 'createFromPlan');
  }
};

// @route DELETE /api/workspaces/:slug/ai/plans/:id (owner) -> 204. A plan still generating is cancelled.
export const deletePlan = async (req: Request, res: Response): Promise<void> => {
  try {
    const plan = await findPlan(req, { ownOnly: true });
    if (!plan) {
      res.status(404).json({ message: 'Plan not found' });
      return;
    }
    const now = new Date();
    await AiPlan.updateOne(
      { _id: plan._id, status: { $in: ['queued', 'running'] } },
      { $set: { status: 'failed', active: false, error: 'Cancelled.', errorCode: 'CANCELLED', completedAt: now } },
    );
    // The content goes; the row stays (until it expires) so that the daily limit still counts the generation
    await AiPlan.updateOne({ _id: plan._id }, { $set: { deletedAt: now, plan: null, 'source.preview': '' } });
    res.status(204).end();
  } catch (error) {
    failure(res, error, 'deletePlan');
  }
};
