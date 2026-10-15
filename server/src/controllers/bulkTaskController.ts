import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { body } from 'express-validator';
import Task, { type ITask, MAX_LABELS, MAX_LABEL_LENGTH, TASK_PRIORITIES, TASK_STATUSES, TASK_TYPES, type TaskStatus } from '../models/taskModel.js';
import { recordActivity } from '../utils/activity.js';
import { normalizeIds } from '../utils/taskGraph.js';
import { stageFor, UNKNOWN_STAGE_MESSAGE, workflowOf } from '../utils/workflow.js';
import { normalizeLabels } from '../utils/taskQuery.js';
import { describeCustomChanges, fieldPath, plainCustom } from '../utils/customFields.js';
import { planRequestCustom } from '../utils/customFieldsDb.js';
import {
  assertEpicTypeChange,
  assertValidAssignees,
  cleanUpRemovedTasks,
  describeTaskChanges,
  findOpenSprint,
  reconcileRelease,
  resolveRelease,
  findValidEpic,
  handleError,
  hasValidationErrors,
  populateTasks,
  spawnNextOccurrence,
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
  body('patch.stage').optional().isString().isLength({ min: 1, max: 30 }).withMessage('Invalid stage'),
  body('patch.priority').optional().isIn(TASK_PRIORITIES).withMessage('Invalid priority'),
  body('patch.type').optional().isIn(TASK_TYPES).withMessage('Invalid type'),
  body('patch.sprint').optional({ values: 'null' }).isMongoId().withMessage('Invalid sprint'),
  body('patch.epic').optional({ values: 'null' }).isMongoId().withMessage('Invalid epic'),
  body('patch.release').optional({ values: 'null' }).isMongoId().withMessage('Invalid release'),
  body('patch.custom').optional().isObject().withMessage('Custom fields must be an object of key and value'),
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

const PATCH_KEYS = ['status', 'stage', 'priority', 'type', 'sprint', 'epic', 'release', 'assignees', 'labels', 'custom'] as const;

type Patch = {
  status?: string;
  stage?: string;
  priority?: string;
  type?: string;
  sprint?: string | null;
  epic?: string | null;
  release?: string | null;
  assignees?: { add?: unknown; remove?: unknown };
  labels?: { add?: unknown; remove?: unknown };
  custom?: unknown;
};

const removeLabels = (labels: string[], remove: string[]): string[] => {
  const gone = new Set(remove.map(label => label.toLowerCase()));
  return labels.filter(label => !gone.has(label.toLowerCase()));
};

// ================================================================
// @desc    Change the same fields on up to 100 tasks at once
// @route   PATCH /api/workspaces/:slug/tasks/bulk
// @body    { ids, patch: { status?, priority?, type?, sprint?, epic?, assignees?: {add,remove}, labels?: {add,remove} } }
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
    const workflow = workflowOf(workspace);

    if (!PATCH_KEYS.some(key => key in patch)) {
      res.status(400).json({ message: 'Nothing to change' });
      return;
    }

    const assigneesToAdd = normalizeIds(patch.assignees?.add);
    const assigneesToRemove = normalizeIds(patch.assignees?.remove);
    const labelsToAdd = normalizeLabels(patch.labels?.add);
    const labelsToRemove = normalizeLabels(patch.labels?.remove);
    assertValidAssignees(workspace, assigneesToAdd);

    // Custom field values are validated once against the workspace's fields
    const customPlan = 'custom' in patch ? await planRequestCustom(workspace, patch.custom, 'update') : null;
    if (customPlan && !customPlan.ok) throw new TaskRuleError(customPlan.error);

    // Resolve the sprint once; moving into it also moves the tasks to its project
    const sprintProject = patch.sprint ? (await findOpenSprint(workspaceId, patch.sprint)).projectName : null;

    // Resolve the epic once; items join it only when they belong to its project
    const epic = patch.epic ? await findValidEpic(workspaceId, patch.epic, null) : null;

    // Resolve the release once; tasks join it only when they belong to its project
    const release = patch.release ? await resolveRelease(workspaceId, patch.release, { type: 'task', project: '' }) : null;

    const tasks = await Task.find({ _id: { $in: ids }, workspace: workspaceId });
    if (tasks.length === 0) {
      res.status(404).json({ message: 'Tasks not found' });
      return;
    }

    // Projects of the epics the tasks already belong to (a sprint move changes the task's project)
    const epicProjects = new Map<string, string>();
    if (sprintProject !== null) {
      const epicIds = tasks.flatMap(task => (task.epic ? [task.epic] : []));
      const linked = epicIds.length > 0 ? await Task.find({ _id: { $in: epicIds }, workspace: workspaceId }).select('project').lean() : [];
      for (const item of linked) epicProjects.set(String(item._id), item.project ?? '');
    }

    const changed: { task: (typeof tasks)[number]; before: Record<string, unknown> }[] = [];
    for (const task of tasks) {
      const before = task.toObject() as unknown as Record<string, unknown>;

      if (patch.status !== undefined || patch.stage !== undefined) {
        const resolved = stageFor(workflow, {
          stage: patch.stage,
          status: patch.status as TaskStatus | undefined,
          currentStage: task.stage,
          currentStatus: task.status,
        });
        if (!resolved) throw new TaskRuleError(UNKNOWN_STAGE_MESSAGE);
        // A status-only request that changes nothing leaves an older task's stage alone (the next real move fixes it)
        if (patch.stage !== undefined || resolved.status !== task.status) {
          if (resolved.stage !== task.stage) task.set('stage', resolved.stage);
          if (resolved.status !== task.status) task.set('status', resolved.status);
        }
      }
      if (patch.priority !== undefined) task.set('priority', patch.priority);
      if (patch.type !== undefined) {
        await assertEpicTypeChange(workspaceId, task._id, task.type, patch.type);
        task.set('type', patch.type);
        // An epic is a container: it cannot be a subtask or sit in an epic
        if (patch.type === 'epic') {
          if (task.parent) throw new TaskRuleError(`"${task.title}" is a subtask and cannot become an epic`);
          if (!('epic' in patch)) task.set('epic', null);
        }
      }

      if ('sprint' in patch) {
        if (patch.sprint && task.type === 'epic') throw new TaskRuleError('Epics cannot be planned in a sprint');
        task.set('sprint', patch.sprint ?? null);
        if (sprintProject !== null) {
          task.set('project', sprintProject);
          const epicProject = task.epic ? epicProjects.get(String(task.epic)) : undefined;
          if (epicProject !== undefined && epicProject !== sprintProject) {
            throw new TaskRuleError(`"${task.title}" belongs to an epic of another project`);
          }
        }
      }

      if ('epic' in patch) {
        if (task.type === 'epic') throw new TaskRuleError(`"${task.title}" is an epic and cannot belong to an epic`);
        if (task.parent) throw new TaskRuleError(`"${task.title}" is a subtask and inherits the epic of its parent`);
        if (epic) {
          if (task.project && task.project !== epic.project) throw new TaskRuleError(`"${task.title}" belongs to another project than the epic`);
          if (!task.project) task.set('project', epic.project);
        }
        task.set('epic', epic ? epic._id : null);
      }

      if ('release' in patch) {
        if (task.type === 'epic' && release) throw new TaskRuleError(`"${task.title}" is an epic and cannot be assigned to a release`);
        if (task.parent) throw new TaskRuleError(`"${task.title}" is a subtask and follows the release of its parent`);
        if (release) {
          if (task.project && task.project.toLowerCase() !== release.project.toLowerCase()) {
            throw new TaskRuleError(`"${task.title}" belongs to another project than the release`);
          }
          if (!task.project) task.set('project', release.project);
        }
        task.set('release', release ? release._id : null);
      } else if (task.release && (sprintProject !== null || patch.type === 'epic')) {
        // A new project or type can make the task's release no longer fit
        await reconcileRelease(workspaceId, task as unknown as ITask, task.release);
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

      if (customPlan?.ok) {
        for (const [key, value] of Object.entries(customPlan.plan.set)) task.set(fieldPath(key), value);
        for (const key of customPlan.plan.clear) task.custom?.delete(key);
      }

      changed.push({ task, before });
    }

    for (const { task, before } of changed) {
      if (!task.isModified()) continue;
      await task.save();

      const changes = describeTaskChanges(before, task.toObject() as unknown as Record<string, unknown>);
      if (customPlan?.ok) changes.push(...describeCustomChanges(plainCustom(before.custom), task.custom, customPlan.defs));
      if (changes.length > 0) {
        await recordActivity(req, { action: 'task.updated', summary: task.title, task: task._id as mongoose.Types.ObjectId, changes });
      }
      // Completing a repeating task schedules its next occurrence (and clears the repeat on this one)
      if (task.status === 'completed' && before.status !== 'completed') await spawnNextOccurrence(req, task);
    }

    // Subtasks follow their parent between projects, sprints, epics and releases
    if ('sprint' in patch || 'epic' in patch || 'release' in patch) {
      for (const { task } of changed) {
        await Task.updateMany(
          { workspace: workspaceId, parent: task._id },
          { $set: { project: task.project, sprint: task.sprint ?? null, release: task.release ?? null, ...('epic' in patch && { epic: task.epic ?? null }) } },
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
