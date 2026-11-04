import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { body } from 'express-validator';
import Automation, {
  IAutomation,
  MAX_AUTOMATIONS_PER_WORKSPACE,
  MAX_AUTOMATION_NAME,
} from '../models/automationModel.js';
import { recordActivity } from '../utils/activity.js';
import { requireUserId } from '../utils/controllerHelpers.js';
import { parseActions, parseConditions, parseTrigger } from '../utils/automation/validate.js';
import { AUTOMATION_TEMPLATES } from '../utils/automation/templates.js';
import { handleError, hasValidationErrors, workspaceOf } from './taskController.js';

// ================================================================
// Validation
// ================================================================
const nameRule = () =>
  body('name').isString().trim().isLength({ min: 1, max: MAX_AUTOMATION_NAME })
    .withMessage(`Name is required (up to ${MAX_AUTOMATION_NAME} characters)`);

const otherRules = () => [
  body('enabled').optional().isBoolean({ strict: true }).withMessage('enabled must be true or false'),
  body('project').optional().isString().trim().isLength({ max: 60 }).withMessage('Project name is too long'),
  body('conditions').optional().custom(value => {
    const parsed = parseConditions(value);
    if (parsed.error) throw new Error(parsed.error);
    return true;
  }),
];

export const validateCreateAutomation = [
  nameRule(),
  ...otherRules(),
  body('trigger').custom(value => {
    const parsed = parseTrigger(value);
    if (parsed.error) throw new Error(parsed.error);
    return true;
  }),
  body('actions').custom(value => {
    const parsed = parseActions(value);
    if (parsed.error) throw new Error(parsed.error);
    return true;
  }),
];

export const validateUpdateAutomation = [
  nameRule().optional(),
  ...otherRules(),
  body('trigger').optional().custom(value => {
    const parsed = parseTrigger(value);
    if (parsed.error) throw new Error(parsed.error);
    return true;
  }),
  body('actions').optional().custom(value => {
    const parsed = parseActions(value);
    if (parsed.error) throw new Error(parsed.error);
    return true;
  }),
];

// ================================================================
// Helpers
// ================================================================
interface PopulatedUser { _id: mongoose.Types.ObjectId; name?: string }

const present = (doc: IAutomation) => {
  const creator = doc.createdBy as unknown as mongoose.Types.ObjectId | PopulatedUser | undefined;
  return {
    _id: String(doc._id),
    name: doc.name,
    enabled: doc.enabled,
    project: doc.project,
    trigger: { type: doc.trigger.type, to: doc.trigger.to ?? '' },
    conditions: doc.conditions.map(({ field, op, value }) => ({ field, op, value })),
    actions: doc.actions.map(({ type, value }) => ({ type, value })),
    runCount: doc.runCount,
    lastRunAt: doc.lastRunAt ?? null,
    createdBy: creator ? { _id: String((creator as PopulatedUser)._id ?? creator), name: (creator as PopulatedUser).name ?? '' } : null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
};

const automationIdOf = (req: Request): mongoose.Types.ObjectId | null => {
  const id = String(req.params.id);
  return mongoose.isValidObjectId(id) && id.length === 24 ? new mongoose.Types.ObjectId(id) : null;
};

/** Members only: the rule would otherwise assign people who cannot see the workspace. */
const checkAssignees = (req: Request, actions: { type: string; value: string }[]): string | null => {
  const members = new Set(workspaceOf(req).members.map(member => String(member.user)));
  const stranger = actions.find(action => action.type === 'assign_to' && !members.has(action.value));
  return stranger ? 'Choose a member of this workspace to assign' : null;
};

// ================================================================
// @desc    Rules of the workspace
// @route   GET /api/workspaces/:slug/automations
// ================================================================
export const listAutomations = async (req: Request, res: Response): Promise<void> => {
  try {
    const rules = await Automation.find({ workspace: workspaceOf(req)._id }).sort({ createdAt: 1 }).populate('createdBy', 'name');
    res.status(200).json(rules.map(present));
  } catch (error) {
    handleError(res, error, 'listAutomations');
  }
};

// ================================================================
// @desc    Ready-made rules to start from
// @route   GET /api/workspaces/:slug/automations/templates
// ================================================================
export const listAutomationTemplates = (_req: Request, res: Response): void => {
  res.status(200).json(AUTOMATION_TEMPLATES);
};

// ================================================================
// @desc    Create a rule
// @route   POST /api/workspaces/:slug/automations
// ================================================================
export const createAutomation = async (req: Request, res: Response): Promise<void> => {
  if (hasValidationErrors(req, res)) return;
  const userId = requireUserId(req, res);
  if (!userId) return;
  try {
    const workspaceId = workspaceOf(req)._id;
    const count = await Automation.countDocuments({ workspace: workspaceId });
    if (count >= MAX_AUTOMATIONS_PER_WORKSPACE) {
      res.status(400).json({ message: `A workspace can have up to ${MAX_AUTOMATIONS_PER_WORKSPACE} rules. Delete one first.` });
      return;
    }
    const trigger = parseTrigger(req.body.trigger).value;
    const conditions = parseConditions(req.body.conditions).value ?? [];
    const actions = parseActions(req.body.actions).value;
    if (!trigger || !actions) {
      res.status(400).json({ message: 'Invalid rule' });
      return;
    }
    const assigneeError = checkAssignees(req, actions);
    if (assigneeError) {
      res.status(400).json({ message: assigneeError });
      return;
    }

    const created = await Automation.create({
      workspace: workspaceId,
      name: String(req.body.name).trim(),
      enabled: req.body.enabled !== false,
      project: typeof req.body.project === 'string' ? req.body.project.trim() : '',
      trigger,
      conditions,
      actions,
      createdBy: userId,
    });
    await recordActivity(req, { action: 'automation.created', summary: created.name });
    const populated = await created.populate('createdBy', 'name');
    res.status(201).json(present(populated));
  } catch (error) {
    handleError(res, error, 'createAutomation');
  }
};

// ================================================================
// @desc    Edit a rule or switch it on or off
// @route   PATCH /api/workspaces/:slug/automations/:id
// ================================================================
export const updateAutomation = async (req: Request, res: Response): Promise<void> => {
  if (hasValidationErrors(req, res)) return;
  try {
    const id = automationIdOf(req);
    const rule = id ? await Automation.findOne({ _id: id, workspace: workspaceOf(req)._id }) : null;
    if (!id || !rule) {
      res.status(404).json({ message: 'Rule not found' });
      return;
    }

    const changes: { field: string; from?: string; to?: string }[] = [];
    if (req.body.name !== undefined) {
      const name = String(req.body.name).trim();
      if (name !== rule.name) changes.push({ field: 'name', from: rule.name, to: name });
      rule.name = name;
    }
    if (req.body.enabled !== undefined) {
      const enabled = req.body.enabled === true;
      if (enabled !== rule.enabled) changes.push({ field: 'enabled', from: String(rule.enabled), to: String(enabled) });
      rule.enabled = enabled;
    }
    if (req.body.project !== undefined) {
      const project = String(req.body.project).trim();
      if (project !== rule.project) changes.push({ field: 'project', from: rule.project || undefined, to: project || undefined });
      rule.project = project;
    }
    if (req.body.trigger !== undefined) {
      rule.trigger = parseTrigger(req.body.trigger).value ?? rule.trigger;
      changes.push({ field: 'trigger' });
    }
    if (req.body.conditions !== undefined) {
      rule.set('conditions', parseConditions(req.body.conditions).value ?? []);
      changes.push({ field: 'conditions' });
    }
    if (req.body.actions !== undefined) {
      const actions = parseActions(req.body.actions).value ?? [];
      const assigneeError = checkAssignees(req, actions);
      if (assigneeError) {
        res.status(400).json({ message: assigneeError });
        return;
      }
      rule.set('actions', actions);
      changes.push({ field: 'actions' });
    }
    await rule.save();

    if (changes.length > 0) await recordActivity(req, { action: 'automation.updated', summary: rule.name, changes });
    const populated = await rule.populate('createdBy', 'name');
    res.status(200).json(present(populated));
  } catch (error) {
    handleError(res, error, 'updateAutomation');
  }
};

// ================================================================
// @desc    Delete a rule
// @route   DELETE /api/workspaces/:slug/automations/:id
// ================================================================
export const deleteAutomation = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = automationIdOf(req);
    const rule = id ? await Automation.findOneAndDelete({ _id: id, workspace: workspaceOf(req)._id }) : null;
    if (!rule) {
      res.status(404).json({ message: 'Rule not found' });
      return;
    }
    await recordActivity(req, { action: 'automation.deleted', summary: rule.name });
    res.status(200).json({ message: 'Rule deleted' });
  } catch (error) {
    handleError(res, error, 'deleteAutomation');
  }
};
