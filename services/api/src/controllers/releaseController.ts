import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { body, query } from 'express-validator';
import Project from '../models/projectModel.js';
import Release, { IRelease, MAX_RELEASE_DESCRIPTION, MAX_RELEASE_NAME } from '../models/releaseModel.js';
import Task from '../models/taskModel.js';
import { diffFields, recordActivity } from '../utils/activity.js';
import { buildReleaseNotes, summarizeProgress, taskKey } from '../utils/releaseNotes.js';
import { PUBLIC_USER_FIELDS, TaskRuleError, handleError, hasValidationErrors, workspaceOf } from './taskController.js';

class ConflictError extends Error {}

const isDuplicateKey = (error: unknown) => (error as { code?: number } | null)?.code === 11000;

const respondError = (res: Response, error: unknown, context: string) => {
  if (error instanceof ConflictError) {
    res.status(409).json({ message: error.message });
    return;
  }
  if (isDuplicateKey(error)) {
    res.status(409).json({ message: 'A release with this name already exists in the project' });
    return;
  }
  handleError(res, error, context);
};

const workspaceIdOf = (req: Request) => workspaceOf(req)._id as mongoose.Types.ObjectId;

/** A request value as an ObjectId, or null when it is not a plain valid id (never a raw value in a query). */
const toObjectId = (value: unknown): mongoose.Types.ObjectId | null =>
  typeof value === 'string' && mongoose.isValidObjectId(value) ? new mongoose.Types.ObjectId(value) : null;

const findRelease = async (req: Request): Promise<IRelease | null> => {
  const id = toObjectId(req.params.id);
  return id ? Release.findOne({ _id: id, workspace: workspaceIdOf(req) }) : null;
};

const notFound = (res: Response) => {
  res.status(404).json({ message: 'Release not found' });
};

const assertDates = (start?: Date | null, end?: Date | null) => {
  if (start && end && start.getTime() > end.getTime()) throw new TaskRuleError('The release date must be on or after the start date');
};

// ================================================================
// Validation
// ================================================================
const dateRule = (field: 'startDate' | 'releaseDate') =>
  body(field).optional({ values: 'null' }).isISO8601().withMessage(`Invalid ${field === 'startDate' ? 'start' : 'release'} date`);

const descriptionRule = body('description').optional().isString().isLength({ max: MAX_RELEASE_DESCRIPTION })
  .withMessage('Description is too long');

export const validateListReleases = [
  query('project').optional().isMongoId().withMessage('Invalid project'),
];

export const validateCreateRelease = [
  body('project').isMongoId().withMessage('A project is required'),
  body('name').isString().trim().notEmpty().withMessage('Name is required')
    .isLength({ max: MAX_RELEASE_NAME }).withMessage('Name is too long'),
  descriptionRule,
  dateRule('startDate'),
  dateRule('releaseDate'),
];

export const validateUpdateRelease = [
  body('name').optional().isString().trim().notEmpty().withMessage('Name cannot be empty')
    .isLength({ max: MAX_RELEASE_NAME }).withMessage('Name is too long'),
  descriptionRule,
  dateRule('startDate'),
  dateRule('releaseDate'),
  body('status').optional().isIn(['unreleased', 'archived']).withMessage('Use the release action to mark a release as released'),
];

export const validateReleaseAction = [
  body('moveOpenTo').optional({ values: 'null' }).isMongoId().withMessage('Open tasks can move to another release of the project'),
];

// ================================================================
// Shapes
// ================================================================

/** Top-level, non-epic tasks of the releases (subtasks follow their parent, so counting them would double the work). */
const progressTasks = (workspaceId: mongoose.Types.ObjectId, releaseIds: mongoose.Types.ObjectId[]) =>
  Task.find({ workspace: workspaceId, release: { $in: releaseIds }, parent: null, type: { $ne: 'epic' } })
    .select('status storyPoints release').lean();

const withProgress = (release: IRelease, tasks: { status: string; storyPoints?: number | null }[]) => ({
  ...(release.toObject() as unknown as Record<string, unknown>),
  nameKey: undefined,
  progress: summarizeProgress(tasks, release),
});

// ================================================================
// Handlers
// ================================================================

/**
 * @desc    Releases of the workspace (optionally of one project) with their progress
 * @route   GET /api/workspaces/:slug/releases?project=
 */
export const listReleases = async (req: Request, res: Response): Promise<void> => {
  if (hasValidationErrors(req, res)) return;
  try {
    const workspaceId = workspaceIdOf(req);
    const filter: { workspace: mongoose.Types.ObjectId; project?: mongoose.Types.ObjectId } = { workspace: workspaceId };
    if (typeof req.query.project === 'string') {
      const project = toObjectId(req.query.project);
      if (!project) throw new TaskRuleError('Invalid project');
      filter.project = project;
    }
    const releases = await Release.find(filter);
    const tasks = releases.length > 0 ? await progressTasks(workspaceId, releases.map(release => release._id as mongoose.Types.ObjectId)) : [];
    const byRelease = new Map<string, typeof tasks>();
    for (const task of tasks) {
      const key = String(task.release);
      byRelease.set(key, [...(byRelease.get(key) ?? []), task]);
    }

    const rank = { unreleased: 0, released: 1, archived: 2 } as const;
    releases.sort((a, b) =>
      rank[a.status] - rank[b.status]
      || (a.releaseDate?.getTime() ?? Infinity) - (b.releaseDate?.getTime() ?? Infinity)
      || a.name.localeCompare(b.name));
    res.status(200).json(releases.map(release => withProgress(release, byRelease.get(String(release._id)) ?? [])));
  } catch (error) {
    respondError(res, error, 'listReleases');
  }
};

/**
 * @desc    One release with its progress, project and tasks
 * @route   GET /api/workspaces/:slug/releases/:id
 */
export const getRelease = async (req: Request, res: Response): Promise<void> => {
  try {
    const release = await findRelease(req);
    if (!release) return notFound(res);
    const workspaceId = workspaceIdOf(req);

    const [project, tasks] = await Promise.all([
      Project.findOne({ _id: release.project, workspace: workspaceId }).select('name key color icon').lean(),
      Task.find({ workspace: workspaceId, release: release._id, parent: null })
        .select('number title status stage type priority storyPoints assignees deadline project')
        .populate('assignees', PUBLIC_USER_FIELDS)
        .sort({ number: 1, createdAt: 1 })
        .lean(),
    ]);
    const key = project?.key ?? '';
    res.status(200).json({
      ...withProgress(release, tasks.filter(task => task.type !== 'epic')),
      project: project ?? { _id: release.project },
      tasks: tasks.map(task => ({ ...task, key: taskKey(key, task.number) })),
    });
  } catch (error) {
    respondError(res, error, 'getRelease');
  }
};

/**
 * @desc    Plan a release (version) in a project
 * @route   POST /api/workspaces/:slug/releases
 */
export const createRelease = async (req: Request, res: Response): Promise<void> => {
  if (hasValidationErrors(req, res)) return;
  try {
    const workspaceId = workspaceIdOf(req);
    const projectId = toObjectId(req.body.project);
    const project = projectId ? await Project.findOne({ _id: projectId, workspace: workspaceId }).select('name').lean() : null;
    if (!project) throw new TaskRuleError('Project not found in this workspace');

    const startDate = req.body.startDate ? new Date(req.body.startDate) : null;
    const releaseDate = req.body.releaseDate ? new Date(req.body.releaseDate) : null;
    assertDates(startDate, releaseDate);

    const release = await Release.create({
      workspace: workspaceId,
      project: project._id,
      name: String(req.body.name).trim(),
      description: req.body.description,
      startDate,
      releaseDate,
      createdBy: req.user?._id,
    });
    await recordActivity(req, { action: 'release.created', summary: `${release.name} · ${project.name}`, project: project._id as mongoose.Types.ObjectId });
    res.status(201).json(withProgress(release, []));
  } catch (error) {
    respondError(res, error, 'createRelease');
  }
};

/**
 * @desc    Edit a release; status "archived" archives it, "unreleased" reopens it
 * @route   PATCH /api/workspaces/:slug/releases/:id
 */
export const updateRelease = async (req: Request, res: Response): Promise<void> => {
  if (hasValidationErrors(req, res)) return;
  try {
    const release = await findRelease(req);
    if (!release) return notFound(res);

    const before = release.toObject() as unknown as Record<string, unknown>;
    if ('name' in req.body) release.set('name', String(req.body.name).trim());
    if ('description' in req.body) release.set('description', req.body.description);
    if ('startDate' in req.body) release.set('startDate', req.body.startDate ? new Date(req.body.startDate) : null);
    if ('releaseDate' in req.body) release.set('releaseDate', req.body.releaseDate ? new Date(req.body.releaseDate) : null);
    if (req.body.status === 'archived') release.set('status', 'archived');
    if (req.body.status === 'unreleased' && release.status !== 'unreleased') {
      release.set('status', 'unreleased');
      release.set('releasedAt', null);
    }
    assertDates(release.startDate, release.releaseDate);
    await release.save();

    const changes = diffFields(before, release.toObject() as unknown as Record<string, unknown>, ['name', 'startDate', 'releaseDate', 'status']);
    if (before.description !== release.description) changes.push({ field: 'description' });
    if (changes.length > 0) {
      await recordActivity(req, { action: 'release.updated', summary: release.name, project: release.project, changes });
    }

    const tasks = await progressTasks(workspaceIdOf(req), [release._id as mongoose.Types.ObjectId]);
    res.status(200).json(withProgress(release, tasks));
  } catch (error) {
    respondError(res, error, 'updateRelease');
  }
};

/**
 * @desc    Delete a release; its tasks stay, without a release
 * @route   DELETE /api/workspaces/:slug/releases/:id
 */
export const deleteRelease = async (req: Request, res: Response): Promise<void> => {
  try {
    const release = await findRelease(req);
    if (!release) return notFound(res);

    const unassigned = await Task.updateMany({ workspace: release.workspace, release: release._id }, { $set: { release: null } });
    await release.deleteOne();
    await recordActivity(req, {
      action: 'release.deleted', summary: release.name, project: release.project,
      changes: unassigned.modifiedCount > 0 ? [{ field: 'tasks', from: String(unassigned.modifiedCount) }] : [],
    });
    res.status(200).json({ message: 'Release deleted', id: String(release._id) });
  } catch (error) {
    respondError(res, error, 'deleteRelease');
  }
};

/**
 * @desc    Mark an unreleased release as released. Unfinished tasks stay (moveOpenTo omitted),
 *          leave the release (null) or move to another unreleased release of the project (id).
 * @route   POST /api/workspaces/:slug/releases/:id/release
 */
export const releaseRelease = async (req: Request, res: Response): Promise<void> => {
  if (hasValidationErrors(req, res)) return;
  try {
    const release = await findRelease(req);
    if (!release) return notFound(res);
    if (release.status !== 'unreleased') throw new TaskRuleError('Only an unreleased release can be released');
    const workspaceId = release.workspace;

    const move = 'moveOpenTo' in req.body;
    let target: mongoose.Types.ObjectId | null = null;
    if (move && req.body.moveOpenTo) {
      const targetId = toObjectId(req.body.moveOpenTo);
      const next = targetId
        ? await Release.findOne({ _id: targetId, workspace: workspaceId, project: release.project, status: { $eq: 'unreleased' } }).select('_id').lean()
        : null;
      if (!next || String(next._id) === String(release._id)) {
        throw new TaskRuleError('Open tasks can only move to another unreleased release of this project');
      }
      target = next._id as mongoose.Types.ObjectId;
    }

    // Conditional update so a double click cannot release it twice
    const released = await Release.findOneAndUpdate(
      { _id: release._id, status: { $eq: 'unreleased' } },
      { $set: { status: 'released', releasedAt: new Date() } },
      { returnDocument: 'after' },
    );
    if (!released) throw new ConflictError('This release was changed by someone else');

    let movedTasks = 0;
    if (move) {
      const open = await Task.find({ workspace: workspaceId, release: release._id, parent: null, status: { $ne: 'completed' } }).select('title').lean();
      const openIds = open.map(task => task._id);
      // Subtasks follow their parent
      await Task.updateMany(
        { workspace: workspaceId, release: release._id, $or: [{ _id: { $in: openIds } }, { parent: { $in: openIds } }] },
        { $set: { release: target } },
      );
      movedTasks = open.length;
      await Promise.all(open.map(task => recordActivity(req, {
        action: 'task.updated', summary: task.title, task: task._id as mongoose.Types.ObjectId,
        changes: [{ field: 'release', from: String(release._id), to: target ? String(target) : undefined }],
      })));
    }

    await recordActivity(req, {
      action: 'release.released', summary: released.name, project: released.project,
      changes: move ? [{ field: 'movedTasks', to: `${movedTasks} → ${target ? 'next release' : 'no release'}` }] : [],
    });
    const tasks = await progressTasks(workspaceId, [released._id as mongoose.Types.ObjectId]);
    res.status(200).json({ release: withProgress(released, tasks), movedTasks });
  } catch (error) {
    respondError(res, error, 'releaseRelease');
  }
};

/**
 * @desc    Release notes: finished work grouped by type (Markdown plus JSON); ?format=markdown returns plain Markdown
 * @route   GET /api/workspaces/:slug/releases/:id/notes
 */
export const getReleaseNotes = async (req: Request, res: Response): Promise<void> => {
  try {
    const release = await findRelease(req);
    if (!release) return notFound(res);
    const workspaceId = workspaceIdOf(req);

    const [project, tasks] = await Promise.all([
      Project.findOne({ _id: release.project, workspace: workspaceId }).select('key').lean(),
      Task.find({ workspace: workspaceId, release: release._id, parent: null }).select('number title type status').lean(),
    ]);
    const notes = buildReleaseNotes(release, tasks, project?.key ?? '');

    if (req.query.format === 'markdown') {
      res.status(200).type('text/markdown').send(notes.markdown);
      return;
    }
    res.status(200).json({ release: { _id: release._id, name: release.name, status: release.status }, ...notes });
  } catch (error) {
    respondError(res, error, 'getReleaseNotes');
  }
};
