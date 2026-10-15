import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { body } from 'express-validator';
import Task, { ITask, MAX_TASK_RELATIONS, TASK_RELATION_TYPES } from '../models/taskModel.js';
import Project from '../models/projectModel.js';
import { formatChangeValue, recordActivity } from '../utils/activity.js';
import {
  assertValidDependencies,
  describeTaskChanges,
  handleError,
  hasValidationErrors,
  populateTasks,
  TaskRuleError,
  workspaceOf,
} from './taskController.js';

type ObjectId = mongoose.Types.ObjectId;

// What a client may send: the stored relation types plus the two that map onto `dependencies`
const LINK_TYPES = [...TASK_RELATION_TYPES, 'blocks', 'blocked_by'] as const;
type LinkType = (typeof LINK_TYPES)[number];

// The type the other task of a link stores
const INVERSE: Record<LinkType, LinkType> = {
  relates: 'relates',
  duplicates: 'duplicated_by',
  duplicated_by: 'duplicates',
  clones: 'cloned_by',
  cloned_by: 'clones',
  blocks: 'blocked_by',
  blocked_by: 'blocks',
};

/** A plain id string from the URL or body as an ObjectId, or null (never a raw request value in a query). */
const castId = (value: unknown): ObjectId | null =>
  typeof value === 'string' && mongoose.isValidObjectId(value) ? new mongoose.Types.ObjectId(value) : null;

/** The allowed link type matching `value` (the constant, not the request value), or undefined. */
const linkTypeOf = (value: unknown): LinkType | undefined => LINK_TYPES.find(type => type === value);

/** "WEB-12" for each task (its title while it has no number), for audit entries. */
const taskLabels = async (workspaceId: ObjectId, tasks: Pick<ITask, '_id' | 'number' | 'project' | 'title'>[]) => {
  const projects = await Project.find({ workspace: workspaceId }).select('name key').lean();
  const keyOf = new Map(projects.map(item => [item.name.trim().toLowerCase(), item.key]));
  return new Map(tasks.map(task => [
    String(task._id),
    task.number === undefined || task.number === null
      ? task.title
      : `${keyOf.get((task.project ?? '').trim().toLowerCase()) ?? 'TM'}-${task.number}`,
  ]));
};

const loadPair = async (workspaceId: ObjectId, id: ObjectId, otherId: ObjectId) => {
  const [task, other] = await Promise.all([
    Task.findOne({ _id: id, workspace: workspaceId }),
    Task.findOne({ _id: otherId, workspace: workspaceId }),
  ]);
  return { task, other };
};

/** Both tasks as sent back to the client, so it can refresh them in its cache. */
const respondWithPair = async (res: Response, status: number, workspaceId: ObjectId, task: ObjectId, other: ObjectId) => {
  const rows = await Task.find({ _id: { $in: [task, other] }, workspace: workspaceId });
  const populated = await populateTasks(rows);
  const byId = new Map(populated.map(row => [String(row._id), row]));
  res.status(status).json({ task: byId.get(String(task)), related: byId.get(String(other)) });
};

// ================================================================
// Issue links
// ================================================================
export const validateAddRelation = [
  body('type').isString().isIn([...LINK_TYPES]).withMessage(`Type must be one of: ${LINK_TYPES.join(', ')}`),
  body('task').isString().custom(value => mongoose.isValidObjectId(value)).withMessage('Choose the task to link'),
];

// ================================================================
// @desc    Link two tasks of the workspace (both sides are written; blocks/blocked_by use `dependencies`)
// @route   POST /api/workspaces/:slug/tasks/:id/relations  { type, task }
// ================================================================
export const addRelation = async (req: Request, res: Response): Promise<void> => {
  if (hasValidationErrors(req, res)) return;

  try {
    const workspaceId = workspaceOf(req)._id as ObjectId;
    const id = castId(req.params.id);
    const otherId = castId(req.body.task);
    const type = linkTypeOf(req.body.type);
    if (!id) { res.status(404).json({ message: 'Task not found' }); return; }
    if (!otherId || !type) throw new TaskRuleError('Invalid link');
    if (id.equals(otherId)) throw new TaskRuleError('A task cannot be linked to itself');

    const { task, other } = await loadPair(workspaceId, id, otherId);
    if (!task) { res.status(404).json({ message: 'Task not found' }); return; }
    if (!other) { res.status(404).json({ message: 'Linked task not found in this workspace' }); return; }

    if (type === 'blocks' || type === 'blocked_by') {
      // "A blocked by B" and "B blocks A" are the same dependency: A waits for B
      const blocked = type === 'blocked_by' ? task : other;
      const blocker = type === 'blocked_by' ? other : task;
      if (blocked.dependencies.some(dep => dep.equals(blocker._id as ObjectId))) {
        throw new TaskRuleError('These tasks are already linked');
      }
      await assertValidDependencies(
        workspaceId,
        String(blocked._id),
        [...blocked.dependencies.map(String), String(blocker._id)],
      );
      await Task.updateOne({ _id: blocked._id, workspace: workspaceId }, { $addToSet: { dependencies: blocker._id } });
    } else {
      if (task.relations.some(item => item.type === type && item.task.equals(other._id as ObjectId))) {
        throw new TaskRuleError('These tasks are already linked');
      }
      if (task.relations.length >= MAX_TASK_RELATIONS || other.relations.length >= MAX_TASK_RELATIONS) {
        throw new TaskRuleError(`A task can have at most ${MAX_TASK_RELATIONS} links to other tasks`);
      }
      const inverse = INVERSE[type] as (typeof TASK_RELATION_TYPES)[number];
      await Task.updateOne({ _id: task._id, workspace: workspaceId }, { $addToSet: { relations: { type, task: other._id } } });
      await Task.updateOne({ _id: other._id, workspace: workspaceId }, { $addToSet: { relations: { type: inverse, task: task._id } } });
    }

    const labels = await taskLabels(workspaceId, [task, other]);
    await recordActivity(req, {
      action: 'task.updated',
      summary: task.title,
      task: task._id as ObjectId,
      changes: [{ field: 'relations', to: formatChangeValue(`${type} ${labels.get(String(other._id))}`) }],
    });
    await recordActivity(req, {
      action: 'task.updated',
      summary: other.title,
      task: other._id as ObjectId,
      changes: [{ field: 'relations', to: formatChangeValue(`${INVERSE[type]} ${labels.get(String(task._id))}`) }],
    });

    await respondWithPair(res, 201, workspaceId, task._id as ObjectId, other._id as ObjectId);
  } catch (error) {
    handleError(res, error, 'addRelation');
  }
};

// ================================================================
// @desc    Remove a link from both tasks (or the dependency for blocks / blocked_by)
// @route   DELETE /api/workspaces/:slug/tasks/:id/relations/:relatedId?type=
// ================================================================
export const removeRelation = async (req: Request, res: Response): Promise<void> => {
  try {
    const workspaceId = workspaceOf(req)._id as ObjectId;
    const id = castId(req.params.id);
    const otherId = castId(req.params.relatedId);
    const type = linkTypeOf(req.query.type);
    if (!id) { res.status(404).json({ message: 'Task not found' }); return; }
    if (!type) throw new TaskRuleError(`Type must be one of: ${LINK_TYPES.join(', ')}`);
    if (!otherId) { res.status(404).json({ message: 'Link not found' }); return; }

    const { task, other } = await loadPair(workspaceId, id, otherId);
    if (!task) { res.status(404).json({ message: 'Task not found' }); return; }
    if (!other) { res.status(404).json({ message: 'Link not found' }); return; }

    if (type === 'blocks' || type === 'blocked_by') {
      const blocked = type === 'blocked_by' ? task : other;
      const blocker = type === 'blocked_by' ? other : task;
      if (!blocked.dependencies.some(dep => dep.equals(blocker._id as ObjectId))) {
        res.status(404).json({ message: 'Link not found' });
        return;
      }
      await Task.updateOne({ _id: blocked._id, workspace: workspaceId }, { $pull: { dependencies: blocker._id } });
    } else {
      if (!task.relations.some(item => item.type === type && item.task.equals(other._id as ObjectId))) {
        res.status(404).json({ message: 'Link not found' });
        return;
      }
      await Task.updateOne(
        { _id: task._id, workspace: workspaceId },
        { $pull: { relations: { type: { $eq: type }, task: other._id } } },
      );
      await Task.updateOne(
        { _id: other._id, workspace: workspaceId },
        { $pull: { relations: { type: { $eq: INVERSE[type] }, task: task._id } } },
      );
    }

    const labels = await taskLabels(workspaceId, [task, other]);
    await recordActivity(req, {
      action: 'task.updated',
      summary: task.title,
      task: task._id as ObjectId,
      changes: [{ field: 'relations', from: formatChangeValue(`${type} ${labels.get(String(other._id))}`) }],
    });
    await recordActivity(req, {
      action: 'task.updated',
      summary: other.title,
      task: other._id as ObjectId,
      changes: [{ field: 'relations', from: formatChangeValue(`${INVERSE[type]} ${labels.get(String(task._id))}`) }],
    });

    await respondWithPair(res, 200, workspaceId, task._id as ObjectId, other._id as ObjectId);
  } catch (error) {
    handleError(res, error, 'removeRelation');
  }
};

// ================================================================
// Convert to subtask / promote to task
// ================================================================
export const validateMoveTask = [
  body('parent')
    .custom(value => value === null || (typeof value === 'string' && mongoose.isValidObjectId(value)))
    .withMessage('Parent must be a task id, or null to promote a subtask'),
];

// ================================================================
// @desc    Make a task a subtask of another top-level task, or promote a subtask (parent: null)
// @route   POST /api/workspaces/:slug/tasks/:id/move  { parent: <taskId> | null }
// ================================================================
export const moveTask = async (req: Request, res: Response): Promise<void> => {
  if (hasValidationErrors(req, res)) return;

  try {
    const workspaceId = workspaceOf(req)._id as ObjectId;
    const id = castId(req.params.id);
    const task = id ? await Task.findOne({ _id: id, workspace: workspaceId }) : null;
    if (!task) { res.status(404).json({ message: 'Task not found' }); return; }

    const before = task.toObject() as unknown as Record<string, unknown>;
    const fromParent = task.parent
      ? await Task.findOne({ _id: task.parent, workspace: workspaceId }).select('number project title').lean()
      : null;
    let toParent: Pick<ITask, '_id' | 'number' | 'project' | 'title'> | null = null;

    if (req.body.parent === null) {
      if (!task.parent) throw new TaskRuleError('This task is not a subtask');
      task.set('parent', null);
    } else {
      const parentId = castId(req.body.parent);
      if (!parentId) throw new TaskRuleError('Invalid parent task');
      if (parentId.equals(task._id as ObjectId)) throw new TaskRuleError('A task cannot be its own parent');
      const parent = await Task.findOne({ _id: parentId, workspace: workspaceId });
      if (!parent) throw new TaskRuleError('Parent task not found in this workspace');
      if (parent.type === 'epic') throw new TaskRuleError('An epic cannot have subtasks; link the item to the epic instead');
      if (parent.parent) throw new TaskRuleError('Subtasks cannot have subtasks');
      if (task.type === 'epic') throw new TaskRuleError('An epic cannot be a subtask');
      if (task.parent && task.parent.equals(parent._id as ObjectId)) throw new TaskRuleError('This task is already a subtask of that task');
      if (await Task.exists({ workspace: workspaceId, parent: task._id })) {
        throw new TaskRuleError('A task with subtasks cannot become a subtask');
      }
      // A subtask lives where its parent lives, follows it, and cannot repeat on its own
      task.set({
        parent: parent._id,
        project: parent.project,
        sprint: parent.sprint ?? null,
        epic: parent.epic ?? null,
        recurrence: null,
        position: Date.now(),
      });
      toParent = parent;
    }
    await task.save();

    const labels = await taskLabels(workspaceId, [fromParent, toParent].filter((item): item is NonNullable<typeof item> => Boolean(item)) as never);
    const describe = (item: { _id: unknown; title: string } | null) =>
      item ? formatChangeValue(`${labels.get(String(item._id))} ${item.title}`) : undefined;
    const after = task.toObject() as unknown as Record<string, unknown>;
    await recordActivity(req, {
      action: 'task.updated',
      summary: task.title,
      task: task._id as ObjectId,
      changes: [
        { field: 'parent', from: describe(fromParent), to: describe(toParent) },
        ...describeTaskChanges(before, after).filter(change => change.field !== 'parent'),
      ],
    });

    res.status(200).json(await populateTasks(task));
  } catch (error) {
    handleError(res, error, 'moveTask');
  }
};
