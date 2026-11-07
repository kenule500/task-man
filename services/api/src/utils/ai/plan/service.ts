import mongoose from 'mongoose';
import AiPlan, { MAX_PLAN_PREVIEW, type IAiPlan } from '../../../models/aiPlanModel.js';
import Project from '../../../models/projectModel.js';
import Workspace from '../../../models/workspaceModel.js';
import { generateJson } from '../provider.js';
import { AiQueueError, STALE_AFTER_MS, startOfUtcDay } from '../reviewService.js';
import { AiReviewError } from '../types.js';
import { resolveWorkspaceAiConfig, type WorkspaceAiConfig, type WorkspaceAiSettings } from '../workspaceConfig.js';
import { readAnalyzerConfig, readPlanConfig, type AnalyzerConfig, type PlanConfig } from './config.js';
import { analyzePlan, isInfrastructureFailure, type AnalyzePlanOptions, type WorkspaceLlm } from './analyzer.js';
import { halveChunk, mergePlans, splitIntoChunks, type Chunk } from './chunk.js';
import { publishPlanUpdated } from './events.js';
import { buildPlanMessages } from './prompt.js';
import { finalizePlan, modelPlanSchema, PLAN_LIMITS, type PlanContent, type PlanLanguage } from './schema.js';

// Queues and runs the generation of a project plan from a document. The document text is only ever held in memory:
// it is handed to `runPlan` by the request that read it and is gone when the generation ends.

type Id = mongoose.Types.ObjectId;

/** Failures that still cost the workspace a generation: the model was called (or the person cancelled mid-way). */
const COUNTED_FAILURES = ['CANCELLED', 'AI_INVALID_OUTPUT', 'ANALYZER_INVALID_OUTPUT'];

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
  const analyzer = readAnalyzerConfig();
  // DocuMind runs on the workspace's own provider too (the request carries its endpoint, model and
  // key), so both engines need the same BYOK configuration and answer with the same refusals.
  if (analyzer.mode === 'documind' && !analyzer.configured) {
    throw new AiQueueError(503, 'ANALYZER_NOT_CONFIGURED', 'The document analyzer is not configured. An operator must set DOCUMENT_ANALYZER_URL and DOCUMENT_ANALYZER_TOKEN.');
  }
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

const failPlan = async (plan: Pick<IAiPlan, '_id' | 'createdBy'>, message: string, code: string): Promise<void> => {
  const failed = await AiPlan.findOneAndUpdate(
    { _id: plan._id, status: { $in: ['queued', 'running'] } },
    { $set: { status: 'failed', active: false, error: message.slice(0, 500), errorCode: code.slice(0, 40), completedAt: new Date() } },
    { returnDocument: 'after' },
  );
  // Tell the waiting page at once; a missed event only leaves its slow fallback in place
  if (failed) await publishPlanUpdated(failed);
};

export interface PreparedDocument {
  /** Text for the model (already shortened to the budget). */
  text: string;
  truncated: boolean;
}

interface ProviderPlan {
  content: PlanContent;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
}

/** The workspace provider a plan runs on, or the safe refusal to store on the plan. */
const workspaceProviderFor = (workspace: { _id: unknown; ai?: WorkspaceAiSettings }): WorkspaceAiConfig => {
  const ai = resolveWorkspaceAiConfig(String(workspace._id), workspace.ai);
  if (workspace.ai?.enabled !== true) throw new AiReviewError('AI was turned off before the generation started.', 'AI_DISABLED');
  if (!ai.available) throw new AiReviewError('AI is no longer configured for this workspace.', ai.problem ?? 'AI_NOT_CONFIGURED');
  return ai;
};

/** The v1 path: the workspace's own provider. It is also the only permitted fallback. */
const runProviderPlan = async (
  plan: Pick<IAiPlan, 'options'>,
  document: PreparedDocument,
  config: ReturnType<typeof readPlanConfig>,
  workspace: { _id: unknown; ai?: WorkspaceAiSettings },
): Promise<ProviderPlan> => {
  const ai = workspaceProviderFor(workspace);

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
  return { content: answer.output, model: answer.model, usage: answer.usage };
};

/** The plan options as the analyzer expects them (its `options` block, not the stored shape). */
const analyzerOptions = (plan: Pick<IAiPlan, 'options'>): AnalyzePlanOptions => ({
  projectName: plan.options.projectName,
  projectKey: plan.options.projectKey,
  sprintLengthWeeks: plan.options.sprintLengthWeeks,
  startDate: plan.options.startDate,
  teamSize: plan.options.teamSize ?? null,
  extraInstructions: plan.options.extraInstructions,
  language: plan.options.language,
  targetProjectId: plan.options.targetProjectId ? String(plan.options.targetProjectId) : null,
});

/** The merged plan's own limits, read from the one place that defines them. */
const MERGE_LIMITS = { maxItems: PLAN_LIMITS.items, maxSprints: PLAN_LIMITS.sprints, maxEpics: PLAN_LIMITS.epics, maxNotes: PLAN_LIMITS.notes };

/** Writes the chunk counter and pushes it to the waiting page (best effort: a missed event only leaves the screen's slow fallback). */
const setProgress = async (planId: Id | string, total: number, done: number): Promise<void> => {
  const updated = await AiPlan.findOneAndUpdate(
    { _id: planId, status: 'running' },
    { $set: { progress: { total, done } } },
    { returnDocument: 'after' },
  );
  if (updated) await publishPlanUpdated(updated);
};

interface DocumentRun {
  content: PlanContent;
  model: string;
  /** True when the chunk cap left part of the document out, so the plan is marked partial. */
  capped: boolean;
}

/**
 * Generates a document plan page by page.
 *
 * The text is split into chunks of at most the analyzer's own limit (`ANALYZER_MAX_CHARS`), each chunk
 * is one analyzer request, and the answers are merged into a single plan. The document is therefore no
 * longer trimmed to a single call: a long brief is planned in full instead of silently losing its
 * middle. Each finished chunk updates the plan's `progress` and is pushed to the waiting page.
 *
 * Only `AI_PLAN_MAX_CHUNKS` chunks are ever asked for, and the whole run must fit `AI_PLAN_TIMEOUT_SECONDS`:
 * a page that cannot finish inside the time left is not started, and a page that fails after some pages
 * are already planned ends the run instead of throwing the work away. A page that fails on its own is
 * divided into two smaller pages and retried (up to four such retries per run), so a merely dense page is
 * planned rather than skipped. In every case the plan is finished from the pages that succeeded and marked
 * partial, so a slow provider, a timeout or one unreadable page yields a smaller plan rather than losing
 * the whole document. (The *first* page has nothing to keep and no halves left, so its failure still
 * travels -- which is what the configured `DOCUMENT_ANALYZER_FALLBACK` handles.)
 */
const runDocumentPlan = async (
  plan: Pick<IAiPlan, '_id' | 'options' | 'source'>,
  document: PreparedDocument,
  analyzer: AnalyzerConfig,
  config: PlanConfig,
  llm: WorkspaceLlm,
): Promise<DocumentRun> => {
  const all = splitIntoChunks(document.text, analyzer.maxChars);
  const firstPage = all.slice(0, config.maxChunks);
  // The document needed more pages than the cap allows, or a page failed or ran out of budget: partial
  let capped = all.length > firstPage.length;
  // A single chunk is the ordinary one-call plan: it reports no phases, so it writes no counter
  const tracked = firstPage.length > 1;

  if (tracked) await setProgress(plan._id, firstPage.length, 0);

  // The whole plan must fit the plan budget. The next page is only started when the average time the
  // pages so far actually took still leaves room for it, so a slow provider yields a *partial plan*
  // rather than running the request out (estimating with the per-call cap would stop after one page).
  const deadline = Date.now() + config.timeoutMs;
  let spentMs = 0;
  // A page that cannot be read is split in two and retried once, so a merely dense page is planned
  // instead of skipped. `resplitsLeft` bounds those retries for the whole run, which keeps the total
  // number of analyzer requests bounded however many pages end up failing.
  const MAX_RESPLITS = 4;
  let resplitsLeft = MAX_RESPLITS;

  const callAnalyzer = (text: string): ReturnType<typeof analyzePlan> =>
    analyzePlan(
      { fileName: plan.source.fileName, mimeType: plan.source.mimeType, text, llm, options: analyzerOptions(plan) },
      analyzer,
    );

  const results: { chunk: Chunk; plan: PlanContent }[] = [];
  let model = '';
  const queue: Chunk[] = [...firstPage].reverse();
  while (queue.length > 0) {
    const chunk = queue.pop()!;
    if (results.length > 0 && Date.now() + spentMs / results.length > deadline) {
      capped = true;
      break;
    }
    const startedAt = Date.now();
    let result: Awaited<ReturnType<typeof analyzePlan>>;
    try {
      result = await callAnalyzer(chunk.text);
      spentMs += Date.now() - startedAt;
    } catch (error) {
      if (!(error instanceof AiReviewError)) throw error;
      // Anything not worth a retry (a refused token, a too-large body) must not be paid for twice
      const retryable = error.code === 'ANALYZER_INVALID_OUTPUT' || isInfrastructureFailure(error.code);
      const halves = retryable && resplitsLeft > 0 ? halveChunk(chunk) : null;
      if (halves) {
        resplitsLeft -= 1;
        // Re-queue both halves so the later chunk is planned first (the stack keeps document order)
        queue.push(halves[1], halves[0]);
        continue;
      }
      // Nothing left to try for this page: keep the pages already planned and mark the plan partial.
      // The *first* page has nothing to keep, so its failure still travels (and the configured
      // DOCUMENT_ANALYZER_FALLBACK still applies).
      if (results.length > 0) {
        capped = true;
        break;
      }
      throw error;
    }
    results.push({ chunk, plan: result.plan });
    model ||= result.model;
    if (tracked) await setProgress(plan._id, firstPage.length, results.length);
  }

  // The work stack visits the document out of order (a page is re-queued ahead of the next one), so
  // the answers are merged in document order, which keeps the plan's first page and its epics stable.
  results.sort((a, b) => a.chunk.startChar - b.chunk.startChar);
  const answers = results.map(entry => entry.plan);

  return {
    content: answers.length === 1 ? answers[0] : mergePlans(answers, MERGE_LIMITS),
    model: model || 'documind',
    capped,
  };
};

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
    const analyzer = readAnalyzerConfig();
    const workspace = await Workspace.findById(plan.workspace).select('+ai.apiKeyEncrypted').lean();
    if (!workspace) throw new AiReviewError('The workspace no longer exists.', 'WORKSPACE_GONE');

    let generated: ProviderPlan & { engine: 'documind' | 'ai' };
    if (analyzer.mode === 'documind') {
      try {
        // Resolved here, not at queue time: the workspace may have had its provider changed or
        // switched off while the plan waited, and the endpoint that runs it is this one. It is also
        // the only provider involved: the analyzer stores no credentials of its own.
        const ai = workspaceProviderFor(workspace);
        const run = await runDocumentPlan(plan, document, analyzer, config, { model: ai.model, apiKey: ai.apiKey, baseUrl: ai.baseURL });
        // The chunk cap left part of the document out: mark the plan partial now, so the notice is accurate
        if (run.capped && !document.truncated) await AiPlan.updateOne({ _id: plan._id }, { $set: { 'source.truncated': true } });
        generated = {
          content: run.content,
          model: run.model,
          usage: { inputTokens: 0, outputTokens: 0 },
          engine: 'documind',
        };
      } catch (error) {
        const known = error instanceof AiReviewError;
        if (!known || !analyzer.fallback || !isInfrastructureFailure(error.code)) throw error;
        generated = { ...(await runProviderPlan(plan, document, config, workspace)), engine: 'ai' };
      }
    } else {
      generated = { ...(await runProviderPlan(plan, document, config, workspace)), engine: 'ai' };
    }

    const { names, keys } = await usedProjectNames(plan.workspace);
    const content = finalizePlan(generated.content, {
      startDate: plan.options.startDate,
      sprintLengthWeeks: plan.options.sprintLengthWeeks,
      projectName: plan.options.projectName,
      projectKey: plan.options.projectKey,
      takenNames: names,
      takenKeys: keys,
    });
    const saved = await AiPlan.findOneAndUpdate(
      { _id: plan._id, status: 'running' },
      {
        $set: {
          status: 'ready', active: false, plan: content, analyzer: generated.engine, model: generated.model, usage: generated.usage, error: '', errorCode: '', completedAt: new Date(),
        },
        // The run is over: a stored counter would only make the review screen think it is still working
        $unset: { progress: 1 },
      },
      { returnDocument: 'after' },
    );
    if (saved) await publishPlanUpdated(saved);
  } catch (error) {
    const known = error instanceof AiReviewError;
    if (!known) console.error('ai plan error:', (error as Error).message);
    const code = known ? error.code : 'AI_PLAN_FAILED';
    const message = known
      ? (code === 'AI_BAD_REQUEST' ? 'The AI provider refused the request (the document may be too long for the model). Try a shorter document.' : error.message)
      : 'The generation failed unexpectedly. Try again.';
    await failPlan(plan, message, code);
  }
};
