import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { body, validationResult } from 'express-validator';
import Task, { TASK_PRIORITIES, TASK_STATUSES } from '../models/taskModel.js';
import { getRequestWorkspace } from '../middleware/workspaceMiddleware.js';
import { normalizeIds, wouldCreateCycle } from '../utils/taskGraph.js';
import {
  buildTaskFilter,
  buildTaskSort,
  parseTaskListQuery,
  PRIORITY_RANK_EXPRESSION,
} from '../utils/taskQuery.js';

// Fields a client is allowed to change on a task
const EDITABLE_FIELDS = [
  'title', 'description', 'project', 'status', 'priority', 'startDate', 'deadline', 'position', 'dependencies',
] as const;

class TaskRuleError extends Error {}

// ================================================================
// Validation
// ================================================================
const optionalFieldRules = [
  body('description').optional().isString().isLength({ max: 2000 }).withMessage('Description is too long'),
  body('project').optional().isString().isLength({ max: 60 }).withMessage('Project name is too long'),
  body('status').optional().isIn(TASK_STATUSES).withMessage('Invalid status'),
  body('priority').optional().isIn(TASK_PRIORITIES).withMessage('Invalid priority'),
  body('startDate').optional({ values: 'null' }).isISO8601().withMessage('Invalid start date'),
  body('position').optional().isNumeric().withMessage('Invalid position'),
  body('dependencies').optional().isArray().withMessage('Dependencies must be a list'),
];

export const validateCreateTask = [
  body('title').isString().trim().notEmpty().withMessage('Title is required')
    .isLength({ max: 140 }).withMessage('Title is too long'),
  body('deadline').isISO8601().withMessage('A valid deadline is required'),
  ...optionalFieldRules,
];

export const validateUpdateTask = [
  body('title').optional().isString().trim().notEmpty().withMessage('Title cannot be empty')
    .isLength({ max: 140 }).withMessage('Title is too long'),
  body('deadline').optional().isISO8601().withMessage('Invalid deadline'),
  ...optionalFieldRules,
];

const hasValidationErrors = (req: Request, res: Response): boolean => {
  const errors = validationResult(req);
  if (errors.isEmpty()) return false;
  res.status(400).json({ errors: errors.array() });
  return true;
};

// ================================================================
// Business rules
// ================================================================
const assertDateOrder = (startDate?: Date | null, deadline?: Date) => {
  if (startDate && deadline && startDate.getTime() > deadline.getTime()) {
    throw new TaskRuleError('Start date must be on or before the deadline');
  }
};

const assertValidDependencies = async (
  workspaceId: mongoose.Types.ObjectId,
  taskId: string | null,
  dependencies: string[],
) => {
  if (dependencies.length === 0) return;

  if (dependencies.some(id => !mongoose.isValidObjectId(id))) {
    throw new TaskRuleError('Invalid dependency id');
  }
  if (taskId && dependencies.includes(taskId)) {
    throw new TaskRuleError('A task cannot depend on itself');
  }

  const workspaceTasks = await Task.find({ workspace: workspaceId }).select('dependencies').lean();
  const graph = new Map(workspaceTasks.map(t => [t._id.toString(), t.dependencies.map(String)]));

  if (dependencies.some(id => !graph.has(id))) {
    throw new TaskRuleError('Dependencies must be tasks from this workspace');
  }
  if (taskId && wouldCreateCycle(taskId, dependencies, graph)) {
    throw new TaskRuleError('This dependency would create a cycle');
  }
};

const handleError = (res: Response, error: unknown, context: string) => {
  if (error instanceof TaskRuleError) {
    res.status(400).json({ message: error.message });
    return;
  }
  console.error(`${context} error:`, error);
  res.status(500).json({ message: 'Server error' });
};

// ================================================================
// @desc    List tasks of a workspace (filter, search, sort, date range)
// @route   GET /api/workspaces/:slug/tasks?status=&project=&search=&sort=&from=&to=
// ================================================================
export const getTasks = async (req: Request, res: Response): Promise<void> => {
  try {
    const workspace = getRequestWorkspace(res);
    const query = parseTaskListQuery(req.query as Record<string, unknown>);

    const tasks = await Task.aggregate([
      { $match: buildTaskFilter(workspace._id, query) },
      { $addFields: { priorityRank: PRIORITY_RANK_EXPRESSION } },
      { $sort: buildTaskSort(query.sort) },
      { $project: { priorityRank: 0, __v: 0 } },
    ]);

    res.status(200).json(tasks);
  } catch (error) {
    handleError(res, error, 'getTasks');
  }
};

// ================================================================
// @desc    Create a task
// @route   POST /api/workspaces/:slug/tasks
// ================================================================
export const createTask = async (req: Request, res: Response): Promise<void> => {
  if (hasValidationErrors(req, res)) return;

  try {
    const workspace = getRequestWorkspace(res);
    const { title, description, project, status, priority, startDate, deadline, position } = req.body;
    const dependencies = normalizeIds(req.body.dependencies);

    const start = startDate ? new Date(startDate) : undefined;
    const due = new Date(deadline);
    assertDateOrder(start, due);
    await assertValidDependencies(workspace._id as mongoose.Types.ObjectId, null, dependencies);

    const task = await Task.create({
      title,
      description,
      project,
      status,
      priority,
      startDate: start,
      deadline: due,
      position,
      dependencies,
      owner: req.user?._id,
      workspace: workspace._id,
    });

    res.status(201).json(task);
  } catch (error) {
    handleError(res, error, 'createTask');
  }
};

// ================================================================
// @desc    Update only the provided fields of a task
// @route   PUT|PATCH /api/workspaces/:slug/tasks/:id
// ================================================================
export const updateTask = async (req: Request, res: Response): Promise<void> => {
  if (hasValidationErrors(req, res)) return;

  try {
    const workspace = getRequestWorkspace(res);
    const id = String(req.params.id);
    const task = mongoose.isValidObjectId(id)
      ? await Task.findOne({ _id: id, workspace: workspace._id })
      : null;

    if (!task) {
      res.status(404).json({ message: 'Task not found' });
      return;
    }

    for (const field of EDITABLE_FIELDS) {
      if (!(field in req.body)) continue;
      const value = req.body[field];

      if (field === 'dependencies') {
        const dependencies = normalizeIds(value);
        await assertValidDependencies(workspace._id as mongoose.Types.ObjectId, id, dependencies);
        task.set('dependencies', dependencies);
      } else if (field === 'startDate') {
        task.set('startDate', value ? new Date(value) : undefined);
      } else if (field === 'deadline') {
        task.set('deadline', new Date(value));
      } else {
        task.set(field, value);
      }
    }

    assertDateOrder(task.startDate, task.deadline);
    await task.save();

    res.status(200).json(task);
  } catch (error) {
    handleError(res, error, 'updateTask');
  }
};

// ================================================================
// @desc    Delete a task and detach it from tasks that depended on it
// @route   DELETE /api/workspaces/:slug/tasks/:id
// ================================================================
export const deleteTask = async (req: Request, res: Response): Promise<void> => {
  try {
    const workspace = getRequestWorkspace(res);
    const id = String(req.params.id);
    const task = mongoose.isValidObjectId(id)
      ? await Task.findOneAndDelete({ _id: id, workspace: workspace._id })
      : null;

    if (!task) {
      res.status(404).json({ message: 'Task not found' });
      return;
    }

    await Task.updateMany(
      { workspace: workspace._id, dependencies: task._id },
      { $pull: { dependencies: task._id } },
    );

    res.status(200).json({ message: 'Task deleted', id });
  } catch (error) {
    handleError(res, error, 'deleteTask');
  }
};
