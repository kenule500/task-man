import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { body, validationResult } from 'express-validator';
import Task, {
  ITask,
  MAX_LABELS,
  MAX_LABEL_LENGTH,
  MAX_STORY_POINTS,
  TASK_PRIORITIES,
  TASK_STATUSES,
  TASK_TYPES,
} from '../models/taskModel.js';
import Project from '../models/projectModel.js';
import Sprint from '../models/sprintModel.js';
import { IWorkspace } from '../models/workspaceModel.js';
import { deleteFiles } from '../utils/gridfs.js';
import { normalizeIds, wouldCreateCycle } from '../utils/taskGraph.js';
import { diffFields, recordActivity } from '../utils/activity.js';
import { notifyTaskEvents } from '../utils/notify.js';
import { ensureTaskNumbers, reserveTaskNumbers } from '../utils/taskNumbers.js';
import {
  buildTaskFilter,
  buildTaskSort,
  normalizeLabels,
  parseTaskListQuery,
  PRIORITY_RANK_EXPRESSION,
} from '../utils/taskQuery.js';

// Fields a client is allowed to change on a task
const EDITABLE_FIELDS = [
  'title', 'description', 'project', 'status', 'priority', 'startDate', 'deadline', 'position', 'dependencies',
  'labels', 'assignees', 'type', 'storyPoints', 'sprint', 'parent', 'epic',
] as const;

// People shown on tasks: never expose email, password hashes or tokens
export const PUBLIC_USER_FIELDS = 'name avatarUrl';
const POPULATE_PATHS = [
  { path: 'assignees', select: PUBLIC_USER_FIELDS },
  { path: 'comments.author', select: PUBLIC_USER_FIELDS },
];

export class TaskRuleError extends Error {}

// Fields whose changes are written to the activity log (description changes are noted without the text)
const AUDITED_FIELDS = [
  'title', 'status', 'priority', 'type', 'storyPoints', 'project', 'startDate', 'deadline', 'labels',
] as const;

/** The workspace attached by requirePermission (req.workspace). */
export const workspaceOf = (req: Request): IWorkspace => req.workspace as IWorkspace;

/** Fills assignees / comment authors with public profile fields (works on documents and plain objects). */
export const populateTasks = <T>(tasks: T): Promise<T> =>
  Task.populate(tasks as never, POPULATE_PATHS) as unknown as Promise<T>;

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
  body('type').optional().isIn(TASK_TYPES).withMessage('Invalid type'),
  body('storyPoints').optional({ values: 'null' }).isInt({ min: 0, max: MAX_STORY_POINTS })
    .withMessage(`Story points must be a whole number from 0 to ${MAX_STORY_POINTS}`),
  body('sprint').optional({ values: 'null' }).isMongoId().withMessage('Invalid sprint'),
  body('parent').optional({ values: 'null' }).isMongoId().withMessage('Invalid parent task'),
  body('epic').optional({ values: 'null' }).isMongoId().withMessage('Invalid epic'),
  body('dependencies').optional().isArray().withMessage('Dependencies must be a list'),
  body('assignees').optional().isArray({ max: 50 }).withMessage('Assignees must be a list'),
  body('labels').optional().isArray({ max: 50 }).withMessage('Labels must be a list')
    .bail()
    .custom((labels: unknown[]) => labels.every(label => typeof label === 'string'))
    .withMessage('Labels must be text')
    .bail()
    .custom((labels: string[]) => normalizeLabels(labels).every(label => label.length <= MAX_LABEL_LENGTH))
    .withMessage(`Each label can be at most ${MAX_LABEL_LENGTH} characters`)
    .bail()
    .custom((labels: string[]) => normalizeLabels(labels).length <= MAX_LABELS)
    .withMessage(`A task can have at most ${MAX_LABELS} labels`),
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

export const hasValidationErrors = (req: Request, res: Response): boolean => {
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

export const assertValidAssignees = (workspace: IWorkspace, assignees: string[]) => {
  if (assignees.some(id => !mongoose.isValidObjectId(id))) {
    throw new TaskRuleError('Invalid assignee id');
  }
  const memberIds = new Set(workspace.members.map(m => m.user.toString()));
  if (assignees.some(id => !memberIds.has(id))) {
    throw new TaskRuleError('Assignees must be members of this workspace');
  }
};

/** The sprint must belong to the workspace and still be open; returns it with its project's name. */
export const findOpenSprint = async (workspaceId: mongoose.Types.ObjectId, sprintId: unknown) => {
  // Only a plain id string reaches the query (never an operator object from the request body)
  if (typeof sprintId !== 'string' || !mongoose.isValidObjectId(sprintId)) throw new TaskRuleError('Invalid sprint');
  const sprint = await Sprint.findOne({ _id: new mongoose.Types.ObjectId(sprintId), workspace: workspaceId });
  if (!sprint) throw new TaskRuleError('Sprint not found in this workspace');
  if (sprint.status === 'completed') throw new TaskRuleError('This sprint is completed');
  const project = await Project.findOne({ _id: sprint.project, workspace: workspaceId }).select('name').lean();
  if (!project) throw new TaskRuleError('Sprint not found in this workspace');
  return { sprint, projectName: project.name };
};

/** Subtasks are one level deep: the parent must be a top-level task of the workspace. */
const findValidParent = async (workspaceId: mongoose.Types.ObjectId, taskId: string | null, parentId: string) => {
  if (typeof parentId !== 'string' || !mongoose.isValidObjectId(parentId)) throw new TaskRuleError('Invalid parent task');
  if (taskId && parentId === taskId) throw new TaskRuleError('A task cannot be its own parent');
  const parent = await Task.findOne({ _id: new mongoose.Types.ObjectId(parentId), workspace: workspaceId }).select('parent project sprint epic type').lean();
  if (!parent) throw new TaskRuleError('Parent task not found in this workspace');
  if (parent.type === 'epic') throw new TaskRuleError('An epic cannot have subtasks; link the item to the epic instead');
  if (parent.parent) throw new TaskRuleError('Subtasks cannot have subtasks');
  if (taskId && await Task.exists({ workspace: workspaceId, parent: taskId })) {
    throw new TaskRuleError('A task with subtasks cannot become a subtask');
  }
  return parent;
};

/** The epic must be a task of type 'epic' in this workspace; returns its id and project. */
export const findValidEpic = async (workspaceId: mongoose.Types.ObjectId, epicId: unknown, taskId: string | null) => {
  // Only a plain id string reaches the query (never an operator object from the request body)
  if (typeof epicId !== 'string' || !mongoose.isValidObjectId(epicId)) throw new TaskRuleError('Invalid epic');
  if (taskId && epicId === taskId) throw new TaskRuleError('A task cannot be its own epic');
  const epic = await Task.findOne({ _id: new mongoose.Types.ObjectId(epicId), workspace: workspaceId }).select('type project').lean();
  if (!epic || epic.type !== 'epic') throw new TaskRuleError('Epic not found in this workspace');
  return { _id: epic._id as mongoose.Types.ObjectId, project: (epic.project ?? '') as string };
};

export interface EpicSubject {
  _id?: unknown;
  type: string;
  epic?: unknown;
  parent?: unknown;
  sprint?: unknown;
  project: string;
}

/**
 * Applies the epic rules to the final state of a task and returns the epic and project it must end up with:
 * epics are containers (no epic, parent or sprint), subtasks inherit the epic of their parent, and an item
 * joins an epic of its own project (an item without project takes the epic's project).
 */
export const resolveEpicLink = async (
  workspaceId: mongoose.Types.ObjectId,
  subject: EpicSubject,
  opts: { epicGiven: boolean; parentEpic?: unknown },
): Promise<{ epic: string | null; project: string }> => {
  const taskId = subject._id ? String(subject._id) : null;
  if (subject.type === 'epic') {
    if (subject.parent) throw new TaskRuleError('An epic cannot be a subtask');
    if (subject.sprint) throw new TaskRuleError('Epics cannot be planned in a sprint');
    if (opts.epicGiven && subject.epic) throw new TaskRuleError('An epic cannot belong to another epic');
    return { epic: null, project: subject.project };
  }
  if (subject.parent) {
    const inherited = opts.parentEpic ? String(opts.parentEpic) : null;
    if (opts.epicGiven && subject.epic && String(subject.epic) !== inherited) {
      throw new TaskRuleError('Subtasks inherit the epic of their parent task');
    }
    return { epic: inherited, project: subject.project };
  }
  if (!subject.epic) return { epic: null, project: subject.project };
  const epic = await findValidEpic(workspaceId, String(subject.epic), taskId);
  if (subject.project && epic.project !== subject.project) throw new TaskRuleError('This epic belongs to another project');
  return { epic: String(epic._id), project: subject.project || epic.project };
};

/** Turning a task into an epic or back needs a clean slate: no subtasks, and no items left in the epic. */
export const assertEpicTypeChange = async (
  workspaceId: mongoose.Types.ObjectId,
  taskId: unknown,
  from: string,
  to: string,
) => {
  if (from === to || (from !== 'epic' && to !== 'epic')) return;
  const id = new mongoose.Types.ObjectId(String(taskId));
  if (to === 'epic' && await Task.exists({ workspace: workspaceId, parent: id })) {
    throw new TaskRuleError('A task with subtasks cannot become an epic');
  }
  if (from === 'epic' && await Task.exists({ workspace: workspaceId, epic: id })) {
    throw new TaskRuleError('Move its items first');
  }
};

/**
 * Keeps project and sprint consistent: a task in a sprint belongs to the sprint's project.
 * Choosing a sprint moves the task to its project; changing the project leaves the sprint.
 */
export const reconcileSprint = async (
  task: ITask,
  workspaceId: mongoose.Types.ObjectId,
  changed: { sprint: boolean; project: boolean },
) => {
  if (!task.sprint || !(changed.sprint || changed.project)) return;
  if (changed.sprint) {
    task.set('project', (await findOpenSprint(workspaceId, String(task.sprint))).projectName);
    return;
  }
  const sprint = await Sprint.findOne({ _id: task.sprint, workspace: workspaceId }).select('project').lean();
  const project = sprint && await Project.findOne({ _id: sprint.project }).select('name').lean();
  if (task.project !== project?.name) task.set('sprint', null);
};

/** Audit entries for the difference between two task snapshots (shared by single and bulk updates). */
export const describeTaskChanges = (before: Record<string, unknown>, after: Record<string, unknown>) => {
  const changes = diffFields(before, after, AUDITED_FIELDS);
  if (String(before.sprint ?? '') !== String(after.sprint ?? '')) {
    changes.push({ field: 'sprint', from: before.sprint ? String(before.sprint) : undefined, to: after.sprint ? String(after.sprint) : undefined });
  }
  if (String(before.epic ?? '') !== String(after.epic ?? '')) {
    changes.push({ field: 'epic', from: before.epic ? String(before.epic) : undefined, to: after.epic ? String(after.epic) : undefined });
  }
  if (String(before.assignees ?? '') !== String(after.assignees ?? '')) {
    changes.push({ field: 'assignees', from: String((before.assignees as unknown[] | undefined)?.length ?? 0), to: String((after.assignees as unknown[] | undefined)?.length ?? 0) });
  }
  if (before.description !== after.description) changes.push({ field: 'description' });
  return changes;
};

export const handleError = (res: Response, error: unknown, context: string) => {
  if (error instanceof TaskRuleError) {
    res.status(400).json({ message: error.message });
    return;
  }
  // Schema rules and malformed ids are the caller's mistake; a duplicate key is a conflict
  if (error instanceof mongoose.Error.ValidationError || error instanceof mongoose.Error.CastError) {
    res.status(400).json({ message: error instanceof mongoose.Error.ValidationError ? Object.values(error.errors)[0]?.message ?? 'Invalid data' : 'Invalid id' });
    return;
  }
  if ((error as { code?: number } | null)?.code === 11000) {
    res.status(409).json({ message: 'This change conflicts with existing data. Reload and try again.' });
    return;
  }
  console.error(`${context} error:`, error);
  res.status(500).json({ message: 'Server error' });
};

// ================================================================
// @desc    List tasks of a workspace (filter, search, sort, date range)
// @route   GET /api/workspaces/:slug/tasks?status=&project=&label=&assignee=me|<userId>&search=&sort=&from=&to=
// ================================================================
export const getTasks = async (req: Request, res: Response): Promise<void> => {
  try {
    const workspace = workspaceOf(req);
    const query = parseTaskListQuery(req.query as Record<string, unknown>);
    await ensureTaskNumbers(workspace._id as mongoose.Types.ObjectId);

    const tasks = await Task.aggregate([
      { $match: buildTaskFilter(workspace._id, query, req.user?._id) },
      { $addFields: { priorityRank: PRIORITY_RANK_EXPRESSION } },
      { $sort: buildTaskSort(query.sort) },
      { $project: { priorityRank: 0, __v: 0 } },
    ]);

    res.status(200).json(await populateTasks(tasks));
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
    const workspace = workspaceOf(req);
    const { title, description, status, priority, startDate, deadline, position, type, storyPoints } = req.body;
    let { project } = req.body;
    let sprint: string | null = req.body.sprint ?? null;
    const parentId: string | null = req.body.parent ?? null;
    let parentEpic: unknown = null;
    const dependencies = normalizeIds(req.body.dependencies);
    const assignees = normalizeIds(req.body.assignees);
    const labels = normalizeLabels(req.body.labels);

    const start = startDate ? new Date(startDate) : undefined;
    const due = new Date(deadline);
    assertDateOrder(start, due);
    await assertValidDependencies(workspace._id as mongoose.Types.ObjectId, null, dependencies);
    assertValidAssignees(workspace, assignees);

    const workspaceId = workspace._id as mongoose.Types.ObjectId;
    // Subtasks join their parent's project and sprint unless told otherwise
    if (parentId) {
      const parent = await findValidParent(workspaceId, null, parentId);
      if (project === undefined) project = parent.project;
      if (req.body.sprint === undefined && parent.sprint) sprint = String(parent.sprint);
      parentEpic = parent.epic;
    }
    if (type === 'epic' && sprint) throw new TaskRuleError('Epics cannot be planned in a sprint');
    if (sprint) project = (await findOpenSprint(workspaceId, sprint)).projectName;
    const link = await resolveEpicLink(
      workspaceId,
      { type: type ?? 'task', epic: req.body.epic ?? null, parent: parentId, sprint, project: project ?? '' },
      { epicGiven: req.body.epic !== undefined, parentEpic },
    );
    project = link.project;

    const number = await reserveTaskNumbers(workspaceId);
    const task = await Task.create({
      number,
      title,
      description,
      project,
      type,
      storyPoints: storyPoints ?? null,
      sprint,
      parent: parentId,
      epic: link.epic,
      status,
      priority,
      startDate: start,
      deadline: due,
      position,
      dependencies,
      assignees,
      labels,
      owner: req.user?._id,
      workspace: workspace._id,
    });

    await recordActivity(req, {
      action: 'task.created', summary: task.title, task: task._id as mongoose.Types.ObjectId,
      changes: parentId ? [{ field: 'parent', to: parentId }] : [],
    });
    await notifyTaskEvents(req, task);
    res.status(201).json(await populateTasks(task));
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
    const workspace = workspaceOf(req);
    const id = String(req.params.id);
    const task = mongoose.isValidObjectId(id)
      ? await Task.findOne({ _id: id, workspace: workspace._id })
      : null;

    if (!task) {
      res.status(404).json({ message: 'Task not found' });
      return;
    }

    const before = task.toObject() as unknown as Record<string, unknown>;
    for (const field of EDITABLE_FIELDS) {
      if (!(field in req.body)) continue;
      const value = req.body[field];

      if (field === 'dependencies') {
        const dependencies = normalizeIds(value);
        await assertValidDependencies(workspace._id as mongoose.Types.ObjectId, id, dependencies);
        task.set('dependencies', dependencies);
      } else if (field === 'assignees') {
        const assignees = normalizeIds(value);
        assertValidAssignees(workspace, assignees);
        task.set('assignees', assignees);
      } else if (field === 'labels') {
        task.set('labels', normalizeLabels(value));
      } else if (field === 'startDate') {
        task.set('startDate', value ? new Date(value) : undefined);
      } else if (field === 'deadline') {
        task.set('deadline', new Date(value));
      } else if (field === 'parent') {
        if (value) await findValidParent(workspace._id as mongoose.Types.ObjectId, id, String(value));
        task.set('parent', value || null);
      } else if (field === 'epic') {
        // Epic rules are applied to the final state below
        task.set('epic', value || null);
      } else if (field === 'sprint' || field === 'storyPoints') {
        task.set(field, value ?? null);
      } else {
        task.set(field, value);
      }
    }

    assertDateOrder(task.startDate, task.deadline);
    await reconcileSprint(task as unknown as ITask, workspace._id as mongoose.Types.ObjectId, {
      sprint: 'sprint' in req.body,
      project: 'project' in req.body,
    });
    const workspaceId = workspace._id as mongoose.Types.ObjectId;
    await assertEpicTypeChange(workspaceId, task._id, String(before.type), task.type);
    if (['epic', 'project', 'sprint', 'type', 'parent'].some(key => key in req.body)) {
      const parentEpic = task.parent
        ? (await Task.findOne({ _id: task.parent, workspace: workspaceId }).select('epic').lean())?.epic
        : null;
      const link = await resolveEpicLink(workspaceId, task, { epicGiven: 'epic' in req.body, parentEpic });
      if (task.type === 'epic' && task.project !== before.project && await Task.exists({ workspace: workspaceId, epic: task._id })) {
        throw new TaskRuleError('Move its items first');
      }
      task.set('epic', link.epic);
      task.set('project', link.project);
    }
    await task.save();

    const after = task.toObject() as unknown as Record<string, unknown>;
    const changes = describeTaskChanges(before, after);
    if (changes.length > 0) {
      await recordActivity(req, { action: 'task.updated', summary: task.title, task: task._id as mongoose.Types.ObjectId, changes });
    }
    await notifyTaskEvents(req, task, {
      assignees: before.assignees as mongoose.Types.ObjectId[] | undefined,
      status: before.status as string | undefined,
    });

    // Subtasks follow their parent between projects and sprints
    if ('sprint' in req.body || 'project' in req.body || 'epic' in req.body || task.project !== before.project) {
      await Task.updateMany(
        { workspace: workspace._id, parent: task._id },
        { $set: { project: task.project, sprint: task.sprint ?? null, epic: task.epic ?? null } },
      );
    }

    res.status(200).json(await populateTasks(task));
  } catch (error) {
    handleError(res, error, 'updateTask');
  }
};

type RemovedTask = { _id: mongoose.Types.ObjectId; attachments?: { fileId: mongoose.Types.ObjectId }[] };

/**
 * After tasks (and their subtasks) were deleted: detach them from tasks that depended on them and
 * remove their GridFS attachments. Shared by single and bulk delete.
 */
export const cleanUpRemovedTasks = async (workspaceId: mongoose.Types.ObjectId, removed: RemovedTask[]) => {
  const removedIds = removed.map(item => item._id);
  await Task.updateMany(
    { workspace: workspaceId, dependencies: { $in: removedIds } },
    { $pull: { dependencies: { $in: removedIds } } },
  );
  // Deleting an epic keeps its items; they just leave the epic
  await Task.updateMany({ workspace: workspaceId, epic: { $in: removedIds } }, { $set: { epic: null } });
  // Attachments live in GridFS, so they are removed explicitly
  await deleteFiles(removed.flatMap(item => (item.attachments ?? []).map(attachment => attachment.fileId)));
};

// ================================================================
// @desc    Delete a task with its subtasks and stored files, and detach them from tasks that depended on them
// @route   DELETE /api/workspaces/:slug/tasks/:id
// ================================================================
export const deleteTask = async (req: Request, res: Response): Promise<void> => {
  try {
    const workspace = workspaceOf(req);
    const id = String(req.params.id);
    const task = mongoose.isValidObjectId(id)
      ? await Task.findOneAndDelete({ _id: id, workspace: workspace._id })
      : null;

    if (!task) {
      res.status(404).json({ message: 'Task not found' });
      return;
    }

    const subtasks = await Task.find({ workspace: workspace._id, parent: task._id }).select('attachments').lean();
    if (subtasks.length > 0) await Task.deleteMany({ _id: { $in: subtasks.map(sub => sub._id) } });
    await cleanUpRemovedTasks(workspace._id as mongoose.Types.ObjectId, [task, ...subtasks]);

    await recordActivity(req, {
      action: 'task.deleted',
      summary: task.title,
      task: task._id as mongoose.Types.ObjectId,
      changes: subtasks.length > 0 ? [{ field: 'subtasks', from: String(subtasks.length) }] : [],
    });
    res.status(200).json({ message: 'Task deleted', id, subtasks: subtasks.map(sub => String(sub._id)) });
  } catch (error) {
    handleError(res, error, 'deleteTask');
  }
};
