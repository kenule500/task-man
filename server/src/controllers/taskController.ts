import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { body, validationResult } from 'express-validator';
import Task, {
  ITask,
  MAX_CHECKLIST_ITEMS,
  MAX_CHECKLIST_TEXT,
  MAX_ESTIMATE_MINUTES,
  MAX_LABELS,
  MAX_LABEL_LENGTH,
  MAX_STORY_POINTS,
  TASK_PRIORITIES,
  TASK_STATUSES,
  TASK_TYPES,
  type TaskStatus,
} from '../models/taskModel.js';
import Project from '../models/projectModel.js';
import TimeEntry from '../models/timeEntryModel.js';
import Sprint from '../models/sprintModel.js';
import Release from '../models/releaseModel.js';
import { IWorkspace } from '../models/workspaceModel.js';
import { deleteFiles } from '../utils/gridfs.js';
import { normalizeIds, wouldCreateCycle } from '../utils/taskGraph.js';
import { diffFields, recordActivity } from '../utils/activity.js';
import { stageFor, UNKNOWN_STAGE_MESSAGE, workflowOf } from '../utils/workflow.js';
import { notifyTaskEvents } from '../utils/notify.js';
import { describeCustomChanges, fieldPath, plainCustom } from '../utils/customFields.js';
import { planRequestCustom } from '../utils/customFieldsDb.js';
import { ensureTaskNumbers, reserveTaskNumbers } from '../utils/taskNumbers.js';
import {
  describeRecurrence,
  nextOccurrenceDates,
  normalizeRecurrence,
  recurrenceProblem,
  type Recurrence,
} from '../utils/recurrence.js';
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
  'labels', 'assignees', 'type', 'storyPoints', 'estimateMinutes', 'sprint', 'parent', 'epic', 'release', 'checklist', 'recurrence',
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
  'title', 'status', 'priority', 'type', 'storyPoints', 'project', 'startDate', 'deadline', 'labels', 'estimateMinutes',
] as const;

/** The workspace attached by requirePermission (req.workspace). */
export const workspaceOf = (req: Request): IWorkspace => req.workspace as IWorkspace;

/** Fills assignees / comment authors with public profile fields (works on documents and plain objects). */
export const populateTasks = <T>(tasks: T): Promise<T> =>
  Task.populate(tasks as never, POPULATE_PATHS) as unknown as Promise<T>;

// ================================================================
// Checklist
// ================================================================
interface ChecklistInput {
  _id?: string;
  text: string;
  done: boolean;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Why a request value is not a valid checklist, or null when it is one. */
export const checklistProblem = (value: unknown): string | null => {
  if (!Array.isArray(value)) return 'Checklist must be a list';
  if (value.length > MAX_CHECKLIST_ITEMS) return `A checklist can have at most ${MAX_CHECKLIST_ITEMS} items`;
  const seen = new Set<string>();
  for (const item of value) {
    if (!isRecord(item)) return 'Checklist items must be objects';
    if (typeof item.text !== 'string' || item.text.trim().length === 0) return 'Checklist items need text';
    if (item.text.trim().length > MAX_CHECKLIST_TEXT) return `Checklist items can be at most ${MAX_CHECKLIST_TEXT} characters`;
    if (item.done !== undefined && typeof item.done !== 'boolean') return 'Checklist item "done" must be true or false';
    if (item._id !== undefined) {
      if (typeof item._id !== 'string' || !mongoose.isValidObjectId(item._id)) return 'Invalid checklist item id';
      if (seen.has(item._id)) return 'Checklist item ids must be unique';
      seen.add(item._id);
    }
  }
  return null;
};

/** Trimmed items with only the known keys (call `checklistProblem` first). Items without an id get one on save. */
export const normalizeChecklist = (value: unknown): ChecklistInput[] =>
  (Array.isArray(value) ? value : []).map(item => ({
    ...(item._id ? { _id: String(item._id) } : {}),
    text: String(item.text).trim(),
    done: item.done === true,
  }));

const validatorFrom = (problem: (value: unknown) => string | null) => (value: unknown) => {
  const message = problem(value);
  if (message) throw new Error(message);
  return true;
};

// ================================================================
// Validation
// ================================================================
const optionalFieldRules = [
  body('checklist').optional().custom(validatorFrom(checklistProblem)),
  body('recurrence').optional({ values: 'null' }).custom(validatorFrom(recurrenceProblem)),
  body('custom').optional().isObject().withMessage('Custom fields must be an object of key and value'),
  body('description').optional().isString().isLength({ max: 2000 }).withMessage('Description is too long'),
  body('project').optional().isString().isLength({ max: 60 }).withMessage('Project name is too long'),
  body('status').optional().isIn(TASK_STATUSES).withMessage('Invalid status'),
  body('stage').optional().isString().isLength({ min: 1, max: 30 }).withMessage('Invalid stage'),
  body('priority').optional().isIn(TASK_PRIORITIES).withMessage('Invalid priority'),
  body('startDate').optional({ values: 'null' }).isISO8601().withMessage('Invalid start date'),
  body('position').optional().isNumeric().withMessage('Invalid position'),
  body('type').optional().isIn(TASK_TYPES).withMessage('Invalid type'),
  body('storyPoints').optional({ values: 'null' }).isInt({ min: 0, max: MAX_STORY_POINTS })
    .withMessage(`Story points must be a whole number from 0 to ${MAX_STORY_POINTS}`),
  body('estimateMinutes').optional({ values: 'null' }).isInt({ min: 0, max: MAX_ESTIMATE_MINUTES })
    .withMessage(`Estimate must be a whole number of minutes from 0 to ${MAX_ESTIMATE_MINUTES}`),
  body('sprint').optional({ values: 'null' }).isMongoId().withMessage('Invalid sprint'),
  body('parent').optional({ values: 'null' }).isMongoId().withMessage('Invalid parent task'),
  body('epic').optional({ values: 'null' }).isMongoId().withMessage('Invalid epic'),
  body('release').optional({ values: 'null' }).isMongoId().withMessage('Invalid release'),
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

/** Only top-level work items can repeat: a subtask follows its parent and an epic is a container. */
const assertCanRecur = (recurrence: Recurrence | null | undefined, task: { parent?: unknown; type?: string }) => {
  if (!recurrence) return;
  if (task.parent) throw new TaskRuleError('Subtasks cannot repeat');
  if (task.type === 'epic') throw new TaskRuleError('Epics cannot repeat');
};

export const assertValidDependencies = async (
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
  const parent = await Task.findOne({ _id: new mongoose.Types.ObjectId(parentId), workspace: workspaceId }).select('parent project sprint epic release type').lean();
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

/**
 * The release a task is assigned to: it must belong to the workspace and to the task's project (a task
 * without a project joins the release's project), and only an unreleased release can receive tasks.
 */
export const resolveRelease = async (
  workspaceId: mongoose.Types.ObjectId,
  releaseId: unknown,
  subject: { type: string; project: string },
) => {
  // Only a plain id string reaches the query (never an operator object from the request body)
  if (typeof releaseId !== 'string' || !mongoose.isValidObjectId(releaseId)) throw new TaskRuleError('Invalid release');
  if (subject.type === 'epic') throw new TaskRuleError('Epics cannot be assigned to a release');
  const release = await Release.findOne({ _id: new mongoose.Types.ObjectId(releaseId), workspace: workspaceId }).select('project status').lean();
  if (!release) throw new TaskRuleError('Release not found in this workspace');
  if (release.status !== 'unreleased') throw new TaskRuleError(`This release is ${release.status}; choose an unreleased one`);
  const project = await Project.findOne({ _id: release.project, workspace: workspaceId }).select('name').lean();
  if (!project) throw new TaskRuleError('Release not found in this workspace');
  if (subject.project && subject.project.toLowerCase() !== project.name.toLowerCase()) {
    throw new TaskRuleError('This release belongs to another project');
  }
  return { _id: release._id as mongoose.Types.ObjectId, project: subject.project || project.name };
};

/**
 * Keeps the release of an updated task consistent: a newly chosen release is validated, and a release
 * that no longer fits the task's project (or type) is dropped.
 */
export const reconcileRelease = async (
  workspaceId: mongoose.Types.ObjectId,
  task: ITask,
  beforeRelease: unknown,
) => {
  if (!task.release) return;
  if (String(task.release) !== String(beforeRelease ?? '')) {
    if (task.parent) throw new TaskRuleError('Subtasks follow the release of their parent task');
    task.set('project', (await resolveRelease(workspaceId, String(task.release), task)).project);
    return;
  }
  const release = await Release.findOne({ _id: task.release, workspace: workspaceId }).select('project').lean();
  const project = release && await Project.findOne({ _id: release.project, workspace: workspaceId }).select('name').lean();
  if (task.type === 'epic' || !project || task.project.toLowerCase() !== project.name.toLowerCase()) task.set('release', null);
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

/** "3/5" for a non-empty checklist snapshot, undefined otherwise. */
const checklistProgress = (items: unknown): string | undefined => {
  if (!Array.isArray(items) || items.length === 0) return undefined;
  return `${items.filter(item => item?.done).length}/${items.length}`;
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
  if (String(before.release ?? '') !== String(after.release ?? '')) {
    changes.push({ field: 'release', from: before.release ? String(before.release) : undefined, to: after.release ? String(after.release) : undefined });
  }
  if (String(before.assignees ?? '') !== String(after.assignees ?? '')) {
    changes.push({ field: 'assignees', from: String((before.assignees as unknown[] | undefined)?.length ?? 0), to: String((after.assignees as unknown[] | undefined)?.length ?? 0) });
  }
  // Moves between stages of the same group; the first assignment of a stage on an older task is not a change
  if (before.stage && after.stage && before.stage !== after.stage) {
    changes.push({ field: 'stage', from: String(before.stage), to: String(after.stage) });
  }
  const progressBefore = checklistProgress(before.checklist);
  const progressAfter = checklistProgress(after.checklist);
  if (progressBefore !== progressAfter) changes.push({ field: 'checklist', from: progressBefore, to: progressAfter });
  const repeatBefore = describeRecurrence(before.recurrence as Recurrence | null | undefined);
  const repeatAfter = describeRecurrence(after.recurrence as Recurrence | null | undefined);
  if (repeatBefore !== repeatAfter) changes.push({ field: 'recurrence', from: repeatBefore, to: repeatAfter });
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
    let parentRelease: unknown = null;
    const dependencies = normalizeIds(req.body.dependencies);
    const assignees = normalizeIds(req.body.assignees);
    const labels = normalizeLabels(req.body.labels);
    const checklist = normalizeChecklist(req.body.checklist ?? []);
    const recurrence = normalizeRecurrence(req.body.recurrence ?? null);

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
      parentRelease = parent.release;
    }
    if (type === 'epic' && sprint) throw new TaskRuleError('Epics cannot be planned in a sprint');
    if (sprint) project = (await findOpenSprint(workspaceId, sprint)).projectName;
    // Subtasks follow the release of their parent (while it is still open)
    let release: mongoose.Types.ObjectId | null = null;
    if (parentId && req.body.release && String(req.body.release) !== String(parentRelease ?? '')) {
      throw new TaskRuleError('Subtasks follow the release of their parent task');
    }
    const releaseId = parentId && (req.body.release ?? null) === null && parentRelease
      && await Release.exists({ _id: parentRelease, workspace: workspaceId, status: { $eq: 'unreleased' } })
      ? String(parentRelease)
      : req.body.release;
    if (releaseId) {
      const resolved = await resolveRelease(workspaceId, releaseId, { type: type ?? 'task', project: project ?? '' });
      release = resolved._id;
      project = resolved.project;
    }
    const resolvedStage = stageFor(workflowOf(workspace), { stage: req.body.stage, status });
    if (!resolvedStage) throw new TaskRuleError(UNKNOWN_STAGE_MESSAGE);
    const link = await resolveEpicLink(
      workspaceId,
      { type: type ?? 'task', epic: req.body.epic ?? null, parent: parentId, sprint, project: project ?? '' },
      { epicGiven: req.body.epic !== undefined, parentEpic },
    );
    project = link.project;
    assertCanRecur(recurrence, { parent: parentId, type: type ?? 'task' });
    const customPlan = await planRequestCustom(workspace, req.body.custom, 'create', project);
    if (!customPlan.ok) throw new TaskRuleError(customPlan.error);

    const number = await reserveTaskNumbers(workspaceId);
    const task = await Task.create({
      number,
      title,
      description,
      project,
      type,
      storyPoints: storyPoints ?? null,
      estimateMinutes: req.body.estimateMinutes ?? null,
      sprint,
      parent: parentId,
      epic: link.epic,
      release,
      status: resolvedStage.status,
      stage: resolvedStage.stage,
      priority,
      startDate: start,
      deadline: due,
      position,
      dependencies,
      assignees,
      labels,
      checklist,
      recurrence,
      custom: customPlan.plan.set,
      // Whoever creates a task follows it
      watchers: req.user ? [req.user._id] : [],
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
      } else if (field === 'checklist') {
        task.set('checklist', normalizeChecklist(value));
      } else if (field === 'recurrence') {
        task.set('recurrence', normalizeRecurrence(value));
      } else if (field === 'startDate') {
        task.set('startDate', value ? new Date(value) : undefined);
      } else if (field === 'deadline') {
        task.set('deadline', new Date(value));
      } else if (field === 'parent') {
        if (value) await findValidParent(workspace._id as mongoose.Types.ObjectId, id, String(value));
        task.set('parent', value || null);
      } else if (field === 'epic' || field === 'release') {
        // Epic and release rules are applied to the final state below
        task.set(field, value || null);
      } else if (field === 'sprint' || field === 'storyPoints' || field === 'estimateMinutes') {
        task.set(field, value ?? null);
      } else {
        task.set(field, value);
      }
    }

    // Stage and status stay in sync: an explicit stage sets the status, a status-only change keeps or picks a stage
    if ('stage' in req.body || 'status' in req.body) {
      const resolvedStage = stageFor(workflowOf(workspace), {
        stage: req.body.stage,
        status: req.body.status,
        currentStage: before.stage as string | undefined,
        currentStatus: before.status as TaskStatus | undefined,
      });
      if (!resolvedStage) throw new TaskRuleError(UNKNOWN_STAGE_MESSAGE);
      if (resolvedStage.stage !== task.stage) task.set('stage', resolvedStage.stage);
      if (resolvedStage.status !== task.status) task.set('status', resolvedStage.status);
    }

    assertDateOrder(task.startDate, task.deadline);
    assertCanRecur(task.recurrence, task);
    // Custom fields merge into the existing values; null clears one
    const customBefore = plainCustom(before.custom);
    const customPlan = 'custom' in req.body ? await planRequestCustom(workspace, req.body.custom, 'update', task.project) : null;
    if (customPlan && !customPlan.ok) throw new TaskRuleError(customPlan.error);
    if (customPlan?.ok) {
      for (const [key, value] of Object.entries(customPlan.plan.set)) task.set(fieldPath(key), value);
      for (const key of customPlan.plan.clear) task.custom?.delete(key);
    }
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
    if (task.release && ['release', 'project', 'sprint', 'epic', 'type'].some(key => key in req.body)) {
      await reconcileRelease(workspaceId, task as unknown as ITask, before.release);
    }
    await task.save();

    const after = task.toObject() as unknown as Record<string, unknown>;
    const changes = describeTaskChanges(before, after);
    if (customPlan?.ok) changes.push(...describeCustomChanges(customBefore, after.custom, customPlan.defs));
    if (changes.length > 0) {
      await recordActivity(req, { action: 'task.updated', summary: task.title, task: task._id as mongoose.Types.ObjectId, changes });
    }
    await notifyTaskEvents(req, task, {
      assignees: before.assignees as mongoose.Types.ObjectId[] | undefined,
      status: before.status as string | undefined,
    });
    if (before.status !== 'completed' && task.status === 'completed') await spawnNextOccurrence(req, task);

    // Subtasks follow their parent between projects, sprints and releases
    if ('sprint' in req.body || 'project' in req.body || 'epic' in req.body || 'release' in req.body || task.project !== before.project) {
      await Task.updateMany(
        { workspace: workspace._id, parent: task._id },
        { $set: { project: task.project, sprint: task.sprint ?? null, epic: task.epic ?? null, release: task.release ?? null } },
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
  // Typed links (relates, duplicates...) to a removed task disappear with it
  await Task.updateMany(
    { workspace: workspaceId, 'relations.task': { $in: removedIds } },
    { $pull: { relations: { task: { $in: removedIds } } } },
  );
  // Deleting an epic keeps its items; they just leave the epic
  await Task.updateMany({ workspace: workspaceId, epic: { $in: removedIds } }, { $set: { epic: null } });
  // Logged time goes with the task (a timer running on it disappears too)
  await TimeEntry.deleteMany({ workspace: workspaceId, task: { $in: removedIds } });
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

// ================================================================
// Copies: duplicate and recurring tasks
// ================================================================

/** A task id from the URL as an ObjectId, or null when it is not one (never a raw request value in a query). */
const castTaskId = (value: unknown): mongoose.Types.ObjectId | null =>
  typeof value === 'string' && mongoose.isValidObjectId(value) ? new mongoose.Types.ObjectId(value) : null;

/** The sprint a copy may join: the source's sprint unless it is gone or completed (then the backlog). */
const reusableSprint = async (workspaceId: mongoose.Types.ObjectId, sprint: unknown) => {
  if (!sprint) return null;
  const sprintId = new mongoose.Types.ObjectId(String(sprint));
  const open = await Sprint.exists({ _id: sprintId, workspace: workspaceId, status: { $ne: 'completed' } });
  return open ? sprintId : null;
};

/** Content a copy takes over: no comments, attachments, links, dependencies or watchers; checklist items start undone. */
const copiedFields = (source: ITask) => {
  const plain = source.toObject() as unknown as ITask;
  return {
    title: plain.title,
    description: plain.description,
    priority: plain.priority,
    type: plain.type,
    storyPoints: plain.storyPoints ?? null,
    project: plain.project,
    parent: plain.parent ?? null,
    epic: plain.epic ?? null,
    labels: [...(plain.labels ?? [])],
    assignees: [...(plain.assignees ?? [])],
    checklist: (plain.checklist ?? []).map(item => ({ text: item.text, done: false })),
    recurrence: plain.parent ? null : plain.recurrence ?? null,
    custom: plainCustom(plain.custom),
    // The estimate carries over; logged time belongs to the original
    estimateMinutes: plain.estimateMinutes ?? null,
    status: 'pending' as const,
  };
};

const uniqueIds = (ids: unknown[]): mongoose.Types.ObjectId[] =>
  normalizeIds(ids).map(id => new mongoose.Types.ObjectId(id));

/**
 * Creates the next occurrence of a recurring task that was just completed and moves the repeat rule to
 * it (the completed task stops repeating, so reopening and completing it again does not add another).
 * The copy keeps the owner and the followers; dates shift from the old due date or from the completion day.
 */
export const spawnNextOccurrence = async (req: Request, source: ITask): Promise<ITask | null> => {
  const recurrence = normalizeRecurrence(source.recurrence);
  if (!recurrence || source.parent) return null;
  try {
    const workspaceId = workspaceOf(req)._id as mongoose.Types.ObjectId;
    const dates = nextOccurrenceDates(
      { startDate: source.startDate, deadline: source.deadline },
      recurrence,
      source.completedAt ?? new Date(),
    );
    const next = await Task.create({
      ...copiedFields(source),
      number: await reserveTaskNumbers(workspaceId),
      sprint: await reusableSprint(workspaceId, source.sprint),
      startDate: dates.startDate,
      deadline: dates.deadline,
      watchers: uniqueIds([...source.watchers, ...(req.user ? [req.user._id] : [])]),
      owner: source.owner,
      workspace: workspaceId,
    });
    await Task.updateOne({ _id: source._id }, { $set: { recurrence: null } });
    source.set('recurrence', null);

    await recordActivity(req, {
      action: 'task.created',
      summary: next.title,
      task: next._id as mongoose.Types.ObjectId,
      changes: [{ field: 'recurrence', to: describeRecurrence(recurrence) }],
    });
    await notifyTaskEvents(req, next);
    return next;
  } catch (error) {
    // The completion itself succeeded; a failed repeat must not turn it into an error
    console.error('spawnNextOccurrence error:', (error as Error).message);
    return null;
  }
};

// ================================================================
// @desc    Copy a task (optionally with its direct subtasks) as a new pending task
// @route   POST /api/workspaces/:slug/tasks/:id/duplicate   body: { includeSubtasks?: boolean }
// ================================================================
export const validateDuplicateTask = [
  body('includeSubtasks').optional().isBoolean({ strict: true }).withMessage('includeSubtasks must be true or false'),
];

export const duplicateTask = async (req: Request, res: Response): Promise<void> => {
  if (hasValidationErrors(req, res)) return;

  try {
    const workspaceId = workspaceOf(req)._id as mongoose.Types.ObjectId;
    const sourceId = castTaskId(req.params.id);
    const source = sourceId ? await Task.findOne({ _id: sourceId, workspace: workspaceId }) : null;
    if (!source) {
      res.status(404).json({ message: 'Task not found' });
      return;
    }

    const subtasks = req.body?.includeSubtasks === true && !source.parent
      ? await Task.find({ workspace: workspaceId, parent: source._id }).sort({ position: 1, _id: 1 })
      : [];
    const first = await reserveTaskNumbers(workspaceId, 1 + subtasks.length);
    const owner = req.user?._id;
    const sprint = await reusableSprint(workspaceId, source.sprint);

    const copy = await Task.create({
      ...copiedFields(source),
      title: `Copy of ${source.title}`.slice(0, 140),
      number: first,
      sprint,
      startDate: source.startDate,
      deadline: source.deadline,
      watchers: owner ? [owner] : [],
      owner,
      workspace: workspaceId,
    });

    const copiedSubtasks: ITask[] = [];
    for (const [index, sub] of subtasks.entries()) {
      copiedSubtasks.push(await Task.create({
        ...copiedFields(sub),
        number: first + 1 + index,
        parent: copy._id,
        project: copy.project,
        epic: copy.epic ?? null,
        sprint,
        startDate: sub.startDate,
        deadline: sub.deadline,
        watchers: owner ? [owner] : [],
        owner,
        workspace: workspaceId,
      }));
    }

    await recordActivity(req, {
      action: 'task.duplicated',
      summary: copy.title,
      task: copy._id as mongoose.Types.ObjectId,
      changes: [
        { field: 'source', from: source.title },
        ...(copiedSubtasks.length > 0 ? [{ field: 'subtasks', to: String(copiedSubtasks.length) }] : []),
      ],
    });
    await notifyTaskEvents(req, copy);

    const [populatedCopy, populatedSubtasks] = await Promise.all([populateTasks(copy), populateTasks(copiedSubtasks)]);
    res.status(201).json({ ...populatedCopy.toObject(), subtasks: populatedSubtasks.map(sub => sub.toObject()) });
  } catch (error) {
    handleError(res, error, 'duplicateTask');
  }
};

// ================================================================
// @desc    Follow / unfollow a task (the signed-in user only)
// @route   POST|DELETE /api/workspaces/:slug/tasks/:id/watch   (tasks:read)
// ================================================================
const setWatching = (watching: boolean) => async (req: Request, res: Response): Promise<void> => {
  try {
    const taskId = castTaskId(req.params.id);
    const userId = req.user?._id;
    const task = taskId && userId
      ? await Task.findOneAndUpdate(
        { _id: taskId, workspace: workspaceOf(req)._id },
        watching ? { $addToSet: { watchers: userId } } : { $pull: { watchers: userId } },
        { returnDocument: 'after', projection: { watchers: 1 } },
      ).lean()
      : null;
    if (!task) {
      res.status(404).json({ message: 'Task not found' });
      return;
    }
    res.status(200).json({ watchers: (task.watchers ?? []).map(String) });
  } catch (error) {
    handleError(res, error, watching ? 'watchTask' : 'unwatchTask');
  }
};

export const watchTask = setWatching(true);
export const unwatchTask = setWatching(false);
