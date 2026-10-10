import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { body } from 'express-validator';
import Project, {
  MAX_PROJECT_DESCRIPTION,
  MAX_PROJECT_NAME,
  PROJECT_COLORS,
  PROJECT_ICONS,
  projectKeyFrom,
} from '../models/projectModel.js';
import Sprint, { MAX_SPRINT_GOAL, MAX_SPRINT_NAME } from '../models/sprintModel.js';
import Task from '../models/taskModel.js';
import { diffFields, recordActivity } from '../utils/activity.js';
import { TaskRuleError, handleError, hasValidationErrors, workspaceOf } from './taskController.js';

// Tasks store their project by name; matching ignores case like the unique index does
const CASE_INSENSITIVE = { locale: 'en', strength: 2 } as const;

class ConflictError extends Error {}

const isDuplicateKey = (error: unknown) => (error as { code?: number } | null)?.code === 11000;

const respondError = (res: Response, error: unknown, context: string) => {
  if (error instanceof ConflictError) {
    res.status(409).json({ message: error.message });
    return;
  }
  if (isDuplicateKey(error)) {
    res.status(409).json({ message: 'A project with this name already exists' });
    return;
  }
  handleError(res, error, context);
};

const workspaceIdOf = (req: Request) => workspaceOf(req)._id as mongoose.Types.ObjectId;

const findProject = (req: Request) => {
  const id = String(req.params.id);
  return mongoose.isValidObjectId(id) ? Project.findOne({ _id: id, workspace: workspaceIdOf(req) }) : null;
};

const findSprint = async (req: Request) => {
  const project = await findProject(req);
  const id = String(req.params.sprintId);
  if (!project || !mongoose.isValidObjectId(id)) return null;
  return Sprint.findOne({ _id: id, project: project._id, workspace: workspaceIdOf(req) });
};

const assertSprintDates = (start: Date, end: Date) => {
  if (start.getTime() > end.getTime()) throw new TaskRuleError('The sprint must end on or after its start date');
};

const notFound = (res: Response, what: 'Project' | 'Sprint') => {
  res.status(404).json({ message: `${what} not found` });
};

// ================================================================
// Validation
// ================================================================
const projectFieldRules = [
  body('description').optional().isString().isLength({ max: MAX_PROJECT_DESCRIPTION }).withMessage('Description is too long'),
  body('color').optional().isIn(PROJECT_COLORS).withMessage('Invalid color'),
  body('icon').optional().isIn(PROJECT_ICONS).withMessage('Invalid icon'),
  body('key').optional().isString().trim().matches(/^[A-Za-z0-9]{2,6}$/).withMessage('Key must be 2 to 6 letters or digits'),
  body('archived').optional().isBoolean().withMessage('Invalid archived flag'),
];

export const validateCreateProject = [
  body('name').isString().trim().notEmpty().withMessage('Name is required')
    .isLength({ max: MAX_PROJECT_NAME }).withMessage('Name is too long'),
  ...projectFieldRules,
];

export const validateUpdateProject = [
  body('name').optional().isString().trim().notEmpty().withMessage('Name cannot be empty')
    .isLength({ max: MAX_PROJECT_NAME }).withMessage('Name is too long'),
  ...projectFieldRules,
];

const sprintGoalRule = body('goal').optional().isString().isLength({ max: MAX_SPRINT_GOAL }).withMessage('Goal is too long');

export const validateCreateSprint = [
  body('name').isString().trim().notEmpty().withMessage('Name is required')
    .isLength({ max: MAX_SPRINT_NAME }).withMessage('Name is too long'),
  body('startDate').isISO8601().withMessage('A valid start date is required'),
  body('endDate').isISO8601().withMessage('A valid end date is required'),
  sprintGoalRule,
];

export const validateUpdateSprint = [
  body('name').optional().isString().trim().notEmpty().withMessage('Name cannot be empty')
    .isLength({ max: MAX_SPRINT_NAME }).withMessage('Name is too long'),
  body('startDate').optional().isISO8601().withMessage('Invalid start date'),
  body('endDate').optional().isISO8601().withMessage('Invalid end date'),
  sprintGoalRule,
];

export const validateCompleteSprint = [
  body('moveOpenTo').optional().isString()
    .custom(value => value === 'backlog' || mongoose.isValidObjectId(value))
    .withMessage('Open tasks can move to the backlog or to another sprint'),
];

// ================================================================
// Projects
// ================================================================

/** Creates a project for every task project name that has none yet (tasks predate the Project model). */
const syncProjectsFromTasks = async (workspaceId: mongoose.Types.ObjectId) => {
  const names = (await Task.distinct('project', { workspace: workspaceId })) as string[];
  const unique = new Map<string, string>();
  for (const raw of names) {
    const name = raw?.trim();
    if (name && !unique.has(name.toLowerCase())) unique.set(name.toLowerCase(), name);
  }
  if (unique.size === 0) return;

  await Project.bulkWrite([...unique].map(([nameKey, name]) => ({
    updateOne: {
      filter: { workspace: workspaceId, nameKey },
      update: {
        $setOnInsert: {
          workspace: workspaceId, name, nameKey, key: projectKeyFrom(name), description: '',
          color: 'blue', icon: 'folder', archived: false,
        },
      },
      upsert: true,
    },
  })), { ordered: false }).catch(error => {
    // Two requests syncing at once can race on the unique index: the project exists either way
    if (!isDuplicateKey(error)) throw error;
  });
};

const withSprints = async <T extends { _id: mongoose.Types.ObjectId }>(project: T) => ({
  ...project,
  nameKey: undefined,
  sprints: await Sprint.find({ project: project._id }).sort({ startDate: 1 }).select('-__v').lean(),
});

/**
 * @desc    Projects of the workspace with their sprints
 * @route   GET /api/workspaces/:slug/projects
 */
export const listProjects = async (req: Request, res: Response): Promise<void> => {
  try {
    const workspaceId = workspaceIdOf(req);
    await syncProjectsFromTasks(workspaceId);

    const [projects, sprints] = await Promise.all([
      Project.find({ workspace: workspaceId }).sort({ archived: 1, name: 1 }).select('-nameKey -__v').lean(),
      Sprint.find({ workspace: workspaceId }).sort({ startDate: 1 }).select('-__v').lean(),
    ]);
    const sprintsByProject = new Map<string, typeof sprints>();
    for (const sprint of sprints) {
      const key = String(sprint.project);
      sprintsByProject.set(key, [...(sprintsByProject.get(key) ?? []), sprint]);
    }

    res.status(200).json(projects.map(project => ({ ...project, sprints: sprintsByProject.get(String(project._id)) ?? [] })));
  } catch (error) {
    respondError(res, error, 'listProjects');
  }
};

/**
 * @desc    Create a project
 * @route   POST /api/workspaces/:slug/projects
 */
export const createProject = async (req: Request, res: Response): Promise<void> => {
  if (hasValidationErrors(req, res)) return;
  try {
    const { name, description, color, icon, key } = req.body;
    const project = await Project.create({
      workspace: workspaceIdOf(req),
      name: String(name).trim(),
      key: key ? String(key).trim().toUpperCase() : undefined,
      description,
      color,
      icon,
      createdBy: req.user?._id,
    });
    await recordActivity(req, { action: 'project.created', summary: project.name, project: project._id as mongoose.Types.ObjectId });
    res.status(201).json({ ...project.toObject(), nameKey: undefined, sprints: [] });
  } catch (error) {
    respondError(res, error, 'createProject');
  }
};

/**
 * @desc    Edit a project (renaming moves its tasks along)
 * @route   PATCH /api/workspaces/:slug/projects/:id
 */
export const updateProject = async (req: Request, res: Response): Promise<void> => {
  if (hasValidationErrors(req, res)) return;
  try {
    const project = await findProject(req);
    if (!project) return notFound(res, 'Project');

    const previousName = project.name;
    const before = project.toObject() as unknown as Record<string, unknown>;
    if ('name' in req.body) project.set('name', String(req.body.name).trim());
    if ('key' in req.body) project.set('key', String(req.body.key).trim().toUpperCase());
    for (const field of ['description', 'color', 'icon', 'archived'] as const) {
      if (field in req.body) project.set(field, req.body[field]);
    }
    await project.save();

    if (project.name !== previousName) {
      await Task.updateMany(
        { workspace: project.workspace, project: previousName },
        { $set: { project: project.name } },
        { collation: CASE_INSENSITIVE },
      );
    }

    const changes = diffFields(before, project.toObject() as unknown as Record<string, unknown>, ['name', 'key', 'color', 'icon', 'archived']);
    if (before.description !== project.description) changes.push({ field: 'description' });
    if (changes.length > 0) {
      await recordActivity(req, { action: 'project.updated', summary: project.name, project: project._id as mongoose.Types.ObjectId, changes });
    }
    res.status(200).json(await withSprints(project.toObject()));
  } catch (error) {
    respondError(res, error, 'updateProject');
  }
};

/**
 * @desc    Delete a project and its sprints; its tasks are kept without a project
 * @route   DELETE /api/workspaces/:slug/projects/:id
 */
export const deleteProject = async (req: Request, res: Response): Promise<void> => {
  try {
    const project = await findProject(req);
    if (!project) return notFound(res, 'Project');

    await Task.updateMany(
      { workspace: project.workspace, project: project.name },
      { $set: { project: '', sprint: null } },
      { collation: CASE_INSENSITIVE },
    );
    await Sprint.deleteMany({ project: project._id });
    await project.deleteOne();

    await recordActivity(req, { action: 'project.deleted', summary: project.name, project: project._id as mongoose.Types.ObjectId });
    res.status(200).json({ message: 'Project deleted', id: String(project._id) });
  } catch (error) {
    respondError(res, error, 'deleteProject');
  }
};

// ================================================================
// Sprints
// ================================================================

/**
 * @desc    Plan a sprint in a project
 * @route   POST /api/workspaces/:slug/projects/:id/sprints
 */
export const createSprint = async (req: Request, res: Response): Promise<void> => {
  if (hasValidationErrors(req, res)) return;
  try {
    const project = await findProject(req);
    if (!project) return notFound(res, 'Project');

    const startDate = new Date(req.body.startDate);
    const endDate = new Date(req.body.endDate);
    assertSprintDates(startDate, endDate);

    const sprint = await Sprint.create({
      workspace: project.workspace,
      project: project._id,
      name: String(req.body.name).trim(),
      goal: req.body.goal,
      startDate,
      endDate,
    });
    await recordActivity(req, {
      action: 'sprint.created', summary: `${sprint.name} · ${project.name}`,
      project: project._id as mongoose.Types.ObjectId, sprint: sprint._id as mongoose.Types.ObjectId,
    });
    res.status(201).json(sprint);
  } catch (error) {
    respondError(res, error, 'createSprint');
  }
};

/**
 * @desc    Edit a sprint's name, goal or dates
 * @route   PATCH /api/workspaces/:slug/projects/:id/sprints/:sprintId
 */
export const updateSprint = async (req: Request, res: Response): Promise<void> => {
  if (hasValidationErrors(req, res)) return;
  try {
    const sprint = await findSprint(req);
    if (!sprint) return notFound(res, 'Sprint');

    const before = sprint.toObject() as unknown as Record<string, unknown>;
    if ('name' in req.body) sprint.set('name', String(req.body.name).trim());
    if ('goal' in req.body) sprint.set('goal', req.body.goal);
    if ('startDate' in req.body) sprint.set('startDate', new Date(req.body.startDate));
    if ('endDate' in req.body) sprint.set('endDate', new Date(req.body.endDate));
    assertSprintDates(sprint.startDate, sprint.endDate);
    const changes = diffFields(before, sprint.toObject() as unknown as Record<string, unknown>, ['name', 'goal', 'startDate', 'endDate']);
    await sprint.save();
    if (changes.length > 0) {
      await recordActivity(req, { action: 'sprint.updated', summary: sprint.name, project: sprint.project, sprint: sprint._id as mongoose.Types.ObjectId, changes });
    }

    res.status(200).json(sprint);
  } catch (error) {
    respondError(res, error, 'updateSprint');
  }
};

/**
 * @desc    Start a planned sprint (one active sprint per project)
 * @route   POST /api/workspaces/:slug/projects/:id/sprints/:sprintId/start
 */
export const startSprint = async (req: Request, res: Response): Promise<void> => {
  try {
    const sprint = await findSprint(req);
    if (!sprint) return notFound(res, 'Sprint');
    if (sprint.status !== 'planned') throw new TaskRuleError('Only a planned sprint can be started');
    if (await Sprint.exists({ project: sprint.project, status: 'active' })) {
      throw new ConflictError('Complete the active sprint of this project first');
    }

    // Conditional update so a double click cannot start it twice
    const started = await Sprint.findOneAndUpdate(
      { _id: sprint._id, status: 'planned' },
      { $set: { status: 'active', startedAt: new Date() } },
      { returnDocument: 'after' },
    );
    if (!started) throw new ConflictError('This sprint was changed by someone else');

    await recordActivity(req, { action: 'sprint.started', summary: started.name, project: started.project, sprint: started._id as mongoose.Types.ObjectId });
    res.status(200).json(started);
  } catch (error) {
    respondError(res, error, 'startSprint');
  }
};

/**
 * @desc    Complete the active sprint; unfinished tasks move to the backlog or to a planned sprint
 * @route   POST /api/workspaces/:slug/projects/:id/sprints/:sprintId/complete
 */
export const completeSprint = async (req: Request, res: Response): Promise<void> => {
  if (hasValidationErrors(req, res)) return;
  try {
    const sprint = await findSprint(req);
    if (!sprint) return notFound(res, 'Sprint');
    if (sprint.status !== 'active') throw new TaskRuleError('Only the active sprint can be completed');

    const moveOpenTo = req.body.moveOpenTo ?? 'backlog';
    let target: mongoose.Types.ObjectId | null = null;
    if (moveOpenTo !== 'backlog') {
      const next = await Sprint.findOne({ _id: moveOpenTo, project: sprint.project, status: 'planned' }).select('_id').lean();
      if (!next) throw new TaskRuleError('Open tasks can only move to a planned sprint of this project');
      target = next._id as mongoose.Types.ObjectId;
    }

    // Velocity counts finished top-level items (subtask points are part of their parent's estimate)
    const done = await Task.find({ workspace: sprint.workspace, sprint: sprint._id, status: 'completed', parent: null }).select('storyPoints').lean();
    const completedPoints = done.reduce((sum, task) => sum + (task.storyPoints ?? 0), 0);

    const completed = await Sprint.findOneAndUpdate(
      { _id: sprint._id, status: 'active' },
      { $set: { status: 'completed', completedAt: new Date(), completedPoints } },
      { returnDocument: 'after' },
    );
    if (!completed) throw new ConflictError('This sprint was changed by someone else');

    // Each carried-over task gets a history entry, so sprint reports can count it as "not completed"
    const carried = await Task.find({ workspace: sprint.workspace, sprint: sprint._id, status: { $ne: 'completed' } })
      .select('title').lean();
    const moved = await Task.updateMany(
      { workspace: sprint.workspace, sprint: sprint._id, status: { $ne: 'completed' } },
      { $set: { sprint: target } },
    );
    await Promise.all(carried.map(task => recordActivity(req, {
      action: 'task.updated', summary: task.title, task: task._id as mongoose.Types.ObjectId, sprint: sprint._id as mongoose.Types.ObjectId,
      changes: [{ field: 'sprint', from: String(sprint._id), to: target ? String(target) : undefined }],
    })));
    await recordActivity(req, {
      action: 'sprint.completed', summary: completed.name, project: completed.project, sprint: completed._id as mongoose.Types.ObjectId,
      changes: [
        { field: 'completedPoints', to: String(completedPoints) },
        { field: 'movedTasks', to: `${moved.modifiedCount} → ${moveOpenTo === 'backlog' ? 'backlog' : 'next sprint'}` },
      ],
    });
    res.status(200).json({ sprint: completed, movedTasks: moved.modifiedCount });
  } catch (error) {
    respondError(res, error, 'completeSprint');
  }
};

/**
 * @desc    Delete a sprint; its tasks go back to the backlog
 * @route   DELETE /api/workspaces/:slug/projects/:id/sprints/:sprintId
 */
export const deleteSprint = async (req: Request, res: Response): Promise<void> => {
  try {
    const sprint = await findSprint(req);
    if (!sprint) return notFound(res, 'Sprint');

    const released = await Task.find({ workspace: sprint.workspace, sprint: sprint._id }).select('title').lean();
    await Task.updateMany({ workspace: sprint.workspace, sprint: sprint._id }, { $set: { sprint: null } });
    await Promise.all(released.map(task => recordActivity(req, {
      action: 'task.updated', summary: task.title, task: task._id as mongoose.Types.ObjectId,
      changes: [{ field: 'sprint', from: String(sprint._id) }],
    })));
    await sprint.deleteOne();

    await recordActivity(req, { action: 'sprint.deleted', summary: sprint.name, project: sprint.project, sprint: sprint._id as mongoose.Types.ObjectId });
    res.status(200).json({ message: 'Sprint deleted', id: String(sprint._id) });
  } catch (error) {
    respondError(res, error, 'deleteSprint');
  }
};
