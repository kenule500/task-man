import { Request, Response } from 'express';
import { body } from 'express-validator';
import { IWorkspace } from '../models/workspaceModel.js';
import Task from '../models/taskModel.js';
import { recordActivity } from '../utils/activity.js';
import type { IActivityChange } from '../models/activityModel.js';
import { firstStageOf, planStageMoves, validateWorkflow, workflowOf, type WorkflowStage } from '../utils/workflow.js';
import { handleError, hasValidationErrors, TaskRuleError, workspaceOf } from './taskController.js';

export const validateWorkflowUpdate = [
  body('stages').isArray().withMessage('Stages must be a list'),
  body('moves').optional().isObject().withMessage('moves must be an object of removed stage -> new stage'),
];

const describeStage = (stage: WorkflowStage) =>
  `${stage.name} (${stage.group}${stage.wipLimit > 0 ? `, limit ${stage.wipLimit}` : ''})`;

/** Audit entries for the difference between two stage lists. */
export const describeWorkflowChanges = (before: readonly WorkflowStage[], after: readonly WorkflowStage[]): IActivityChange[] => {
  const changes: IActivityChange[] = [];
  for (const stage of after) {
    const old = before.find(item => item.key === stage.key);
    if (!old) changes.push({ field: `stage:${stage.key}`, to: describeStage(stage) });
    else if (describeStage(old) !== describeStage(stage)) changes.push({ field: `stage:${stage.key}`, from: describeStage(old), to: describeStage(stage) });
  }
  for (const stage of before) {
    if (!after.some(item => item.key === stage.key)) changes.push({ field: `stage:${stage.key}`, from: describeStage(stage) });
  }
  if (changes.length === 0 && before.map(s => s.key).join() !== after.map(s => s.key).join()) {
    changes.push({ field: 'order', from: before.map(s => s.name).join(', '), to: after.map(s => s.name).join(', ') });
  }
  return changes;
};

// ================================================================
// @desc    Stages of the workspace workflow (the default three when none were configured)
// @route   GET /api/workspaces/:slug/workflow   (tasks:read)
// ================================================================
export const getWorkflow = async (req: Request, res: Response): Promise<void> => {
  res.status(200).json({ stages: workflowOf(workspaceOf(req)) });
};

// ================================================================
// @desc    Replace the stages. Tasks of removed stages move to moves[key] (default: first stage of their group)
// @route   PUT /api/workspaces/:slug/workflow   body: { stages, moves? }   (settings:manage)
// ================================================================
export const updateWorkflow = async (req: Request, res: Response): Promise<void> => {
  if (hasValidationErrors(req, res)) return;

  try {
    const workspace: IWorkspace = workspaceOf(req);
    const checked = validateWorkflow(req.body.stages);
    if (!checked.ok) throw new TaskRuleError(checked.error);
    const before = workflowOf({ workflow: workspace.workflow });
    const after = checked.stages;

    const rawMoves = (req.body.moves ?? {}) as Record<string, unknown>;
    for (const [from, to] of Object.entries(rawMoves)) {
      if (typeof to !== 'string' || !after.some(stage => stage.key === to)) {
        throw new TaskRuleError(`Tasks of "${from}" cannot move to an unknown stage`);
      }
    }
    const moves = planStageMoves(before, after, rawMoves);

    workspace.set('workflow', { stages: after });
    // The stage limits replace the old per-status board limits
    workspace.set('boardSettings', { wipLimits: { pending: null, 'in-progress': null, completed: null } });
    await workspace.save();

    // A stage that changed group takes its tasks along (their status is the group)
    for (const stage of after) {
      const old = before.find(item => item.key === stage.key);
      if (!old || old.group === stage.group) continue;
      const matching = { workspace: workspace._id, stage: { $eq: stage.key }, status: { $eq: old.group } };
      await Task.updateMany(
        matching,
        stage.group === 'completed'
          ? { $set: { status: stage.group, completedAt: new Date() } }
          : { $set: { status: stage.group }, $unset: { completedAt: '' } },
      );
    }

    for (const move of moves) {
      const removed = before.find(stage => stage.key === move.from);
      const target = after.find(stage => stage.key === move.to) ?? firstStageOf(after, removed?.group ?? 'pending');
      // Strings from the validated workflow lists only; always scoped to this workspace
      const matching = { workspace: workspace._id, stage: { $eq: move.from } };
      if (removed && removed.group !== target.group) {
        const done = target.group === 'completed';
        await Task.updateMany(
          { ...matching, status: { $eq: removed.group } },
          done
            ? { $set: { stage: target.key, status: target.group, completedAt: new Date() } }
            : { $set: { stage: target.key, status: target.group }, $unset: { completedAt: '' } },
        );
      } else {
        await Task.updateMany({ ...matching, status: { $eq: target.group } }, { $set: { stage: target.key } });
      }
      // Tasks whose status moved on without them (stale stage) fall back to their status group
      await Task.updateMany(matching, { $set: { stage: '' } });
    }

    const changes = describeWorkflowChanges(before, after);
    if (changes.length > 0) {
      await recordActivity(req, { action: 'workflow.updated', summary: workspace.name, changes });
    }
    res.status(200).json({ stages: workflowOf(workspace) });
  } catch (error) {
    handleError(res, error, 'updateWorkflow');
  }
};
