import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { body } from 'express-validator';
import Task, { MAX_LABELS, MAX_LABEL_LENGTH, TASK_PRIORITIES, TASK_STATUSES, TASK_TYPES } from '../models/taskModel.js';
import { recordActivity } from '../utils/activity.js';
import { normalizeIds } from '../utils/taskGraph.js';
import { normalizeLabels } from '../utils/taskQuery.js';
import {
  assertValidAssignees,
  cleanUpRemovedTasks,
  describeTaskChanges,
  findOpenSprint,
  handleError,
  hasValidationErrors,
  populateTasks,
  TaskRuleError,
  workspaceOf,
} from './taskController.js';

export const MAX_BULK_TASKS = 100;
const MAX_ASSIGNEES = 50;

// ================================================================
// Validation
// ================================================================
const idList = (path: string) => body(path)
  .isArray({ min: 1, max: MAX_BULK_TASKS }).withMessage(`Choose between 1 and ${MAX_BULK_TASKS} tasks`);

const idListItems = (path: string) => body(`${path}.*`).isMongoId().withMessage('Invalid task id');

const addRemoveRules = (field: 'assignees' | 'labels') => [
  body(`patch.${field}`).optional().isObject().withMessage(`${field} must be an object with add and/or remove`),
  ...(['add', 'remove'] as const).map(key => body(`patch.${field}.${key}`)
    .optional().isArray({ max: 50 }).withMessage(`${field}.${key} must be a list`)),
];

export const validateBulkUpdate = [
  idList('ids'),
  idListItems('ids'),
  body('patch').isObject().withMessage('patch is required'),
  body('patch.status').optional().isIn(TASK_STATUSES).withMessage('Invalid status'),
  body('patch.priority').optional().isIn(TASK_PRIORITIES).withMessage('Invalid priority'),
  body('patch.type').optional().isIn(TASK_TYPES).withMessage('Invalid type'),
  body('patch.sprint').optional({ values: 'null' }).isMongoId().withMessage('Invalid sprint'),
  ...addRemoveRules('assignees'),
  body(['patch.assignees.add.*', 'patch.assignees.remove.*']).isMongoId().withMessage('Invalid assignee id'),
  ...addRemoveRules('labels'),
  body(['patch.labels.add.*', 'patch.labels.remove.*']).isString().withMessage('Labels must be text')
    .bail()
    .custom((label: string) => normalizeLabels([label]).every(item => item.length <= MAX_LABEL_LENGTH))
    .withMessage(`Each label can be at most ${MAX_LABEL_LENGTH} characters`),
];

export const validateBulkDelete = [
  idList('ids'),
  idListItems('ids'),
];

const PATCH_KEYS = ['status', 'priority', 'type', 'sprint', 'assignees', 'labels'] as const;

type Patch = {
  status?: string;
  priority?: string;
  type?: string;
  sprint?: string | null;
  assignees?: { add?: unknown; remove?: unknown };
  labels?: { add?: unknown; remove?: unknown };
};

const removeLabels = (labels: string[], remove: string[]): string[] => {
  const gone = new Set(remove.map(label => label.toLowerCase()));
  return labels.filter(label => !gone.has(label.toLowerCase()));
};

// ================================================================
// @desc    Change the same fields on up to 100 tasks at once
// @route   PATCH /api/workspaces/:slug/tasks/bulk
// @body    { ids, patch: { status?, priority?, type?, sprint?, assignees?: {add,remove}, labels?: {add,remove} } }
// All tasks are checked before any is saved, so a rule violation changes nothing.
// ================================================================
export const bulkUpdateTasks = async (req: Request, res: Response): Promise<void> => {
  if (hasValidationErrors(req, res)) return;

  try {
    const workspace = workspaceOf(req);
    const workspaceId = workspace._id as mongoose.Types.ObjectId;
    // Validated ids, cast to ObjectIds so no request value reaches a query as-is
    const ids = normalizeIds(req.body.ids).filter(id => mongoose.isValidObjectId(id)).map(id => new mongoose.Types.ObjectId(id));
    const patch: Patch = req.body.patch ?? {};

    if (!PATCH_KEYS.some(key => key in patch)) {
      res.status(400).json({ message: 'Nothing to change' });
      return;
    }

    const assigneesToAdd = normalizeIds(patch.assignees?.add);
    const assigneesToRemove = normalizeIds(patch.assignees?.remove);
    const labelsToAdd = normalizeLabels(patch.labels?.add);
    const labelsToRemove = normalizeLabels(patch.labels?.remove);
    assertValidAssignees(workspace, assigneesToAdd);

    // Resolve the sprint once; moving into it also moves the tasks to its project
    const sprintProject = patch.sprint ? (await findOpenSprint(workspaceId, patch.sprint)).projectName : null;

    const tasks = await Task.find({ _id: { $in: ids }, workspace: workspaceId });
    if (tasks.length === 0) {
      res.status(404).json({ message: 'Tasks not found' });
      return;
    }

    const changed: { task: (typeof tasks)[number]; before: Record<string, unknown> }[] = [];
    for (const task of tasks) {
      const before = task.toObject() as unknown as Record<string, unknown>;

      if (patch.status !== undefined) task.set('status', patch.status);
      if (patch.priority !== undefined) task.set('priority', patch.priority);
      if (patch.type !== undefined) task.set('type', patch.type);

      if ('sprint' in patch) {
        task.set('sprint', patch.sprint ?? null);
        if (sprintProject !== null) task.set('project', sprintProject);
      }

      if (assigneesToAdd.length > 0 || assigneesToRemove.length > 0) {
        const removed = new Set(assigneesToRemove);
        const next = normalizeIds([...task.assignees.map(String), ...assigneesToAdd]).filter(id => !removed.has(id));
        if (next.length > MAX_ASSIGNEES) throw new TaskRuleError(`A task can have at most ${MAX_ASSIGNEES} assignees`);
        task.set('assignees', next);
      }

      if (labelsToAdd.length > 0 || labelsToRemove.length > 0) {
        const next = normalizeLabels([...removeLabels(task.labels, labelsToRemove), ...labelsToAdd]);
        if (next.length > MAX_LABELS) {
          throw new TaskRuleError(`"${task.title}" would have more than ${MAX_LABELS} labels`);
        }
        task.set('labels', next);
      }

      changed.push({ task, before });
    }

    for (const { task, before } of changed) {
      if (!task.isModified()) continue;
      await task.save();

      const changes = describeTaskChanges(before, task.toObject() as unknown as Record<string, unknown>);
      if (changes.length > 0) {
        await recordActivity(req, { action: 'task.updated', summary: task.title, task: task._id as mongoose.Types.ObjectId, changes });
      }
    }

    // Subtasks follow their parent between projects and sprints
    if ('sprint' in patch) {
      for (const { task } of changed) {
        await Task.updateMany(
          { workspace: workspaceId, parent: task._id },
          { $set: { project: task.project, sprint: task.sprint ?? null } },
        );
      }
    }

    res.status(200).json({ tasks: await populateTasks(changed.map(item => item.task)) });
  } catch (error) {
    handleError(res, error, 'bulkUpdateTasks');
  }
};

// ================================================================
// @desc    Delete several tasks with their subtasks and stored files
// @route   POST /api/workspaces/:slug/tasks/bulk-delete
// @body    { ids }
// ================================================================
export const bulkDeleteTasks = async (req: Request, res: Response): Promise<void> => {
  if (hasValidationErrors(req, res)) return;

  try {
    const workspaceId = workspaceOf(req)._id as mongoose.Types.ObjectId;
    // Validated ids, cast to ObjectIds so no request value reaches a query as-is
    const ids = normalizeIds(req.body.ids).filter(id => mongoose.isValidObjectId(id)).map(id => new mongoose.Types.ObjectId(id));

    const tasks = await Task.find({ _id: { $in: ids }, workspace: workspaceId });
    if (tasks.length === 0) {
      res.status(404).json({ message: 'Tasks not found' });
      return;
    }

    const taskIds = new Set(tasks.map(task => String(task._id)));
    const subtasks = (await Task.find({ workspace: workspaceId, parent: { $in: tasks.map(task => task._id) } })
      .select('attachments parent').lean())
      .filter(sub => !taskIds.has(String(sub._id)));

    const everyId = [...tasks.map(task => task._id), ...subtasks.map(sub => sub._id)];
    await Task.deleteMany({ _id: { $in: everyId }, workspace: workspaceId });
    await cleanUpRemovedTasks(workspaceId, [...tasks, ...subtasks]);

    for (const task of tasks) {
      const own = subtasks.filter(sub => String(sub.parent) === String(task._id)).length;
      await recordActivity(req, {
        action: 'task.deleted',
        summary: task.title,
        task: task._id as mongoose.Types.ObjectId,
        changes: own > 0 ? [{ field: 'subtasks', from: String(own) }] : [],
      });
    }

    res.status(200).json({
      deleted: tasks.map(task => String(task._id)),
      subtasks: subtasks.map(sub => String(sub._id)),
    });
  } catch (error) {
    handleError(res, error, 'bulkDeleteTasks');
  }
};
