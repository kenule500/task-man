import mongoose from 'mongoose';
import AiPlan, { MAX_PLAN_PREVIEW, type IAiPlan } from '../../../models/aiPlanModel.js';
import Project from '../../../models/projectModel.js';
import Workspace from '../../../models/workspaceModel.js';
import { generateJson } from '../provider.js';
import { AiQueueError, STALE_AFTER_MS, startOfUtcDay } from '../reviewService.js';
import { AiReviewError } from '../types.js';
import { resolveWorkspaceAiConfig, type WorkspaceAiConfig, type WorkspaceAiSettings } from '../workspaceConfig.js';
import { readPlanConfig } from './config.js';
import { buildPlanMessages } from './prompt.js';
import { finalizePlan, modelPlanSchema, type PlanLanguage } from './schema.js';

// Queues and runs the generation of a project plan from a document. The document text is only ever held in memory:
// it is handed to `runPlan` by the request that read it and is gone when the generation ends.

type Id = mongoose.Types.ObjectId;

/** Failures that still cost the workspace a generation: the model was called (or the person cancelled mid-way). */
const COUNTED_FAILURES = ['CANCELLED', 'AI_INVALID_OUTPUT'];

/** Plans that count against the workspace's daily limit (one that failed before reaching the model does not). */
export const countPlansUsedToday = (workspaceId: Id | string, now = new Date()): Promise<number> =>
  AiPlan.countDocuments({
    workspace: workspaceId,
    createdAt: { $gte: startOfUtcDay(now) },
    $nor: [{ status: 'failed', 'usage.inputTokens': 0, errorCode: { $nin: COUNTED_FAILURES } }],
  });

export interface PlanOptionsInput {
  projectName: string;
  projectKey: string;
  sprintLengthWeeks: number;
  startDate: string;
  teamSize: number | null;
  extraInstructions: string;
  language: PlanLanguage;
  targetProjectId: mongoose.Types.ObjectId | null;
}

/** Whether the feature is on for this workspace (provider and key present and the workspace opted in). */
export const assertPlanFeatureOn = (workspaceId: Id | string, settings: WorkspaceAiSettings | undefined): WorkspaceAiConfig => {
  const ai = resolveWorkspaceAiConfig(String(workspaceId), settings);
  if (!ai.available) throw new AiQueueError(503, 'AI_NOT_CONFIGURED', 'AI is not configured for this workspace. An owner or admin can set it up in the workspace settings.');
  if (settings?.enabled !== true) throw new AiQueueError(503, 'AI_DISABLED', 'AI is turned off for this workspace. An administrator can turn it on in the settings.');
  return ai;
};

/** Everything that can refuse a new generation before any work is done: feature off, one already running, daily limit. */
export const assertCanQueuePlan = async (input: { workspaceId: Id; userId: Id; settings: WorkspaceAiSettings | undefined }): Promise<WorkspaceAiConfig> => {
  const ai = assertPlanFeatureOn(input.workspaceId, input.settings);
  const config = readPlanConfig();

  await AiPlan.updateMany(
    { workspace: input.workspaceId, createdBy: input.userId, active: true, createdAt: { $lt: new Date(Date.now() - STALE_AFTER_MS) } },
    { $set: { status: 'failed', active: false, error: 'The generation did not finish and was stopped.', errorCode: 'STALE', completedAt: new Date() } },
  );
  if (await AiPlan.exists({ workspace: input.workspaceId, createdBy: input.userId, active: true })) {
    throw new AiQueueError(409, 'PLAN_IN_PROGRESS', 'A project is already being generated for you. Wait for it to finish or cancel it.');
  }
  if (await countPlansUsedToday(input.workspaceId) >= config.dailyLimit) {
    throw new AiQueueError(429, 'AI_DAILY_LIMIT', `This workspace has used its ${config.dailyLimit} AI project plans for today. The limit resets at midnight UTC.`);
  }
  return ai;
};

export interface QueuePlanInput {
  workspaceId: Id;
  userId: Id;
  source: { fileName: string; mimeType: string; size: number; chars: number; truncated: boolean; text: string };
  options: PlanOptionsInput;
  /** Model resolved from the workspace configuration when the plan was queued. */
  model: string;
}

/** Stores the queued plan. Only a short preview of the text is kept, never the document. */
export const createQueuedPlan = async (input: QueuePlanInput): Promise<IAiPlan> => {
  try {
    return await AiPlan.create({
      workspace: input.workspaceId,
      createdBy: input.userId,
      status: 'queued',
      source: {
        fileName: input.source.fileName,
        mimeType: input.source.mimeType,
        size: input.source.size,
        chars: input.source.chars,
        truncated: input.source.truncated,
        preview: input.source.text.slice(0, MAX_PLAN_PREVIEW),
      },
      options: {
        ...input.options,
        targetProjectId: input.options.targetProjectId ?? null,
      },
      model: input.model,
    });
  } catch (error) {
    // The unique index lost a race with a simultaneous upload of the same person
    if ((error as { code?: number }).code === 11000) {
      throw new AiQueueError(409, 'PLAN_IN_PROGRESS', 'A project is already being generated for you. Wait for it to finish or cancel it.');
    }
    throw error;
  }
};

/** Lower-case names and upper-case keys of the workspace's projects. */
export const usedProjectNames = async (workspaceId: Id): Promise<{ names: Set<string>; keys: Set<string> }> => {
  const projects = await Project.find({ workspace: workspaceId }).select('name key').lean();
  return {
    names: new Set(projects.map(project => String(project.name).toLowerCase())),
    keys: new Set(projects.map(project => String(project.key).toUpperCase())),
  };
};

const failPlan = async (planId: Id, message: string, code: string): Promise<void> => {
  await AiPlan.updateOne(
    { _id: planId, status: { $in: ['queued', 'running'] } },
    { $set: { status: 'failed', active: false, error: message.slice(0, 500), errorCode: code.slice(0, 40), completedAt: new Date() } },
  );
};

export interface PreparedDocument {
  /** Text for the model (already shortened to the budget). */
  text: string;
  truncated: boolean;
}

/** Does the whole generation for a queued plan. Never throws: problems end up on the plan as a safe message. */
export const runPlan = async (planId: Id | string, document: PreparedDocument): Promise<void> => {
  const plan = await AiPlan.findOneAndUpdate(
    { _id: planId, status: 'queued' },
    { $set: { status: 'running', startedAt: new Date() } },
    { returnDocument: 'after' },
  );
  if (!plan) return;

  try {
    const config = readPlanConfig();
    const workspace = await Workspace.findById(plan.workspace).select('ai +ai.apiKeyEncrypted').lean();
    if (!workspace) throw new AiReviewError('The workspace no longer exists.', 'WORKSPACE_GONE');
    const ai = resolveWorkspaceAiConfig(String(workspace._id), workspace.ai);
    if (workspace.ai?.enabled !== true) throw new AiReviewError('AI was turned off before the generation started.', 'AI_DISABLED');
    if (!ai.available) throw new AiReviewError('AI is no longer configured for this workspace.', 'AI_NOT_CONFIGURED');

    const messages = buildPlanMessages({
      document: document.text,
      truncated: document.truncated,
      options: {
        projectName: plan.options.projectName || undefined,
        projectKey: plan.options.projectKey || undefined,
        sprintLengthWeeks: plan.options.sprintLengthWeeks,
        teamSize: plan.options.teamSize ?? undefined,
        extraInstructions: plan.options.extraInstructions || undefined,
        language: plan.options.language,
        existingProject: Boolean(plan.options.targetProjectId),
      },
    });

    const answer = await generateJson(modelPlanSchema, messages, {
      maxTokens: config.maxOutputTokens,
      timeoutMs: config.timeoutMs,
      config: ai,
    });

    const { names, keys } = await usedProjectNames(plan.workspace);
    const content = finalizePlan(answer.output, {
      startDate: plan.options.startDate,
      sprintLengthWeeks: plan.options.sprintLengthWeeks,
      projectName: plan.options.projectName,
      projectKey: plan.options.projectKey,
      takenNames: names,
      takenKeys: keys,
    });
    await AiPlan.findOneAndUpdate(
      { _id: plan._id, status: 'running' },
      {
        $set: {
          status: 'ready', active: false, plan: content, model: answer.model, usage: answer.usage, error: '', errorCode: '', completedAt: new Date(),
        },
      },
    );
  } catch (error) {
    const known = error instanceof AiReviewError;
    if (!known) console.error('ai plan error:', (error as Error).message);
    const code = known ? error.code : 'AI_PLAN_FAILED';
    const message = known
      ? (code === 'AI_BAD_REQUEST' ? 'The AI provider refused the request (the document may be too long for the model). Try a shorter document.' : error.message)
      : 'The generation failed unexpectedly. Try again.';
    await failPlan(plan._id as Id, message, code);
  }
};
