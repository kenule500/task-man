import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { body, query } from 'express-validator';
import Page, { IPage, MAX_PAGE_CONTENT, MAX_PAGE_DEPTH, MAX_PAGE_TITLE, MAX_PAGE_VERSIONS } from '../models/pageModel.js';
import PageVersion from '../models/pageVersionModel.js';
import Project from '../models/projectModel.js';
import Task from '../models/taskModel.js';
import { recordActivity } from '../utils/activity.js';
import {
  canMoveUnder, depthOf, escapeRegex, extractTaskKeys, slugify, snippetAround, uniqueSlug, type PageNode,
} from '../utils/pages.js';
import { TaskRuleError, handleError, hasValidationErrors, workspaceOf } from './taskController.js';

const USER_FIELDS = 'name avatarUrl';
const SEARCH_LIMIT = 30;

const workspaceIdOf = (req: Request) => workspaceOf(req)._id as mongoose.Types.ObjectId;

/** A request value as an ObjectId, or null when it is not a plain valid id (never a raw value in a query). */
const toObjectId = (value: unknown): mongoose.Types.ObjectId | null =>
  typeof value === 'string' && mongoose.isValidObjectId(value) ? new mongoose.Types.ObjectId(value) : null;

const notFound = (res: Response) => {
  res.status(404).json({ message: 'Page not found' });
};

// ================================================================
// Validation
// ================================================================
const titleRule = () => body('title').isString().trim().notEmpty().withMessage('Title is required')
  .isLength({ max: MAX_PAGE_TITLE }).withMessage('Title is too long');
const contentRule = () => body('content').optional().isString().isLength({ max: MAX_PAGE_CONTENT })
  .withMessage('The page is too long (100,000 characters at most)');
const parentRule = () => body('parent').optional({ values: 'null' }).isMongoId().withMessage('Invalid parent page');

export const validateListPages = [
  query('project').optional().isString().isLength({ max: 60 }).withMessage('Invalid project'),
];

export const validateSearchPages = [
  query('q').isString().isLength({ min: 2, max: 100 }).withMessage('Type at least 2 characters to search'),
  query('project').optional().isString().isLength({ max: 60 }).withMessage('Invalid project'),
];

export const validateCreatePage = [
  titleRule(),
  contentRule(),
  parentRule(),
  body('project').optional().isString().trim().isLength({ max: 60 }).withMessage('Invalid project'),
];

export const validateUpdatePage = [
  body('version').isInt({ min: 1 }).withMessage('version is required').toInt(),
  titleRule().optional(),
  contentRule(),
  body('archived').optional().isBoolean({ strict: true }).withMessage('archived must be true or false'),
];

export const validateMovePage = [
  parentRule(),
  body('index').optional().isInt({ min: 0, max: 10_000 }).withMessage('Invalid position').toInt(),
];

// ================================================================
// Helpers
// ================================================================
type UserRef = { _id: mongoose.Types.ObjectId; name?: string; avatarUrl?: string } | mongoose.Types.ObjectId | null | undefined;

const presentUser = (user: UserRef) => {
  if (!user) return null;
  const populated = user as { _id?: mongoose.Types.ObjectId; name?: string; avatarUrl?: string };
  if (populated.name !== undefined) return { _id: String(populated._id), name: populated.name, avatarUrl: populated.avatarUrl ?? '' };
  return { _id: String(user), name: '', avatarUrl: '' };
};

/** API shape of a page; the tree omits `content` to stay small. */
const present = (page: IPage, withContent: boolean) => ({
  _id: String(page._id),
  project: page.project,
  parent: page.parent ? String(page.parent) : null,
  title: page.title,
  slug: page.slug,
  ...(withContent ? { content: page.content } : {}),
  position: page.position,
  version: page.version,
  archived: page.archived,
  createdBy: presentUser(page.createdBy as UserRef),
  updatedBy: presentUser(page.updatedBy as UserRef),
  createdAt: page.createdAt,
  updatedAt: page.updatedAt,
});

/** Canonical name of a project of the workspace (the pages store it like task.project), or null. */
const resolveProjectName = async (workspaceId: mongoose.Types.ObjectId, value: unknown): Promise<string | null> => {
  const name = typeof value === 'string' ? value.trim() : '';
  if (!name) return '';
  const project = await Project.findOne({ workspace: workspaceId, nameKey: { $eq: name.toLowerCase() } }).select('name').lean();
  return project ? project.name : null;
};

const loadNodes = async (workspaceId: mongoose.Types.ObjectId, project: string): Promise<Map<string, PageNode>> => {
  const rows = await Page.find({ workspace: workspaceId, project: { $eq: project } }).select('parent').lean();
  return new Map(rows.map(row => [String(row._id), { _id: String(row._id), parent: row.parent ? String(row.parent) : null }]));
};

const findPage = (req: Request, populate = true) => {
  const id = toObjectId(req.params.id);
  if (!id) return null;
  const find = Page.findOne({ _id: id, workspace: workspaceIdOf(req) });
  return populate ? find.populate('createdBy updatedBy', USER_FIELDS) : find;
};

/** Task keys ("WEB-12") written in the Markdown that match a real task of the workspace. */
const resolveMentions = async (workspaceId: mongoose.Types.ObjectId, content: string) => {
  const keys = extractTaskKeys(content);
  if (keys.length === 0) return [];
  const projects = await Project.find({ workspace: workspaceId, key: { $in: [...new Set(keys.map(item => item.prefix))] } })
    .select('name key').lean();
  if (projects.length === 0) return [];
  const projectNameByKey = new Map(projects.map(project => [project.key, project.name.toLowerCase()]));
  const tasks = await Task.find({ workspace: workspaceId, number: { $in: [...new Set(keys.map(item => item.number))] } })
    .select('number title status project').lean();
  return keys.flatMap(item => {
    const projectName = projectNameByKey.get(item.prefix);
    const task = projectName ? tasks.find(candidate => candidate.number === item.number && (candidate.project ?? '').toLowerCase() === projectName) : undefined;
    return task ? [{ key: item.key, id: String(task._id), title: task.title, status: task.status }] : [];
  });
};

const presentFull = async (req: Request, page: IPage) => ({
  ...present(page, true),
  mentions: await resolveMentions(workspaceIdOf(req), page.content),
});

/** Keeps only the newest MAX_PAGE_VERSIONS snapshots of a page. */
const pruneVersions = async (pageId: mongoose.Types.ObjectId) => {
  const stale = await PageVersion.find({ page: pageId }).sort({ version: -1 }).skip(MAX_PAGE_VERSIONS).select('_id').lean();
  if (stale.length > 0) await PageVersion.deleteMany({ _id: { $in: stale.map(row => row._id) } });
};

/** Saves the text a page had before an edit, so it can be restored. */
const snapshot = async (before: IPage) => {
  await PageVersion.create({
    page: before._id,
    workspace: before.workspace,
    version: before.version,
    title: before.title,
    content: before.content,
    editedBy: before.updatedBy ?? before.createdBy,
  });
  await pruneVersions(before._id as mongoose.Types.ObjectId);
};

const staleResponse = async (req: Request, res: Response, id: mongoose.Types.ObjectId) => {
  const latest = await Page.findOne({ _id: id, workspace: workspaceIdOf(req) }).populate('createdBy updatedBy', USER_FIELDS);
  if (!latest) return notFound(res);
  res.status(409).json({
    message: 'Someone else changed this page while you were editing',
    page: await presentFull(req, latest),
  });
};

/**
 * Applies a title/content/archived change when the caller edited the latest version.
 * Returns the updated page, or null when the page is gone or newer than `version`.
 */
const applyEdit = async (
  req: Request,
  id: mongoose.Types.ObjectId,
  version: number,
  set: Partial<Pick<IPage, 'title' | 'content' | 'archived'>>,
): Promise<{ before: IPage; after: IPage } | null> => {
  const before = await Page.findOneAndUpdate(
    { _id: id, workspace: workspaceIdOf(req), version },
    { $set: { ...set, updatedBy: req.user?._id }, $inc: { version: 1 } },
    { new: false, runValidators: true },
  );
  if (!before) return null;
  await snapshot(before);
  const after = await Page.findById(id).populate('createdBy updatedBy', USER_FIELDS);
  return after ? { before, after } : null;
};

// ================================================================
// @desc    Page tree (titles only) of the workspace wiki, or of one project with ?project=Name
// @route   GET /api/workspaces/:slug/pages?project=
// ================================================================
export const listPages = async (req: Request, res: Response): Promise<void> => {
  if (hasValidationErrors(req, res)) return;
  try {
    const workspaceId = workspaceIdOf(req);
    const project = await resolveProjectName(workspaceId, req.query.project);
    if (project === null) return void res.status(404).json({ message: 'Project not found' });
    const pages = await Page.find({ workspace: workspaceId, project: { $eq: project } })
      .select('-content')
      .sort({ position: 1, title: 1 })
      .populate('createdBy updatedBy', USER_FIELDS);
    res.status(200).json(pages.map(page => present(page, false)));
  } catch (error) {
    handleError(res, error, 'listPages');
  }
};

// ================================================================
// @desc    Search titles and content across the workspace (optionally one project)
// @route   GET /api/workspaces/:slug/pages/search?q=&project=
// ================================================================
export const searchPages = async (req: Request, res: Response): Promise<void> => {
  if (hasValidationErrors(req, res)) return;
  try {
    const workspaceId = workspaceIdOf(req);
    const text = String(req.query.q).trim();
    if (text.length < 2) return void res.status(200).json([]);
    // The user's text is escaped, so it can only ever match literally
    const pattern = { $regex: escapeRegex(text), $options: 'i' };
    const filter: Record<string, unknown> = { workspace: workspaceId, archived: false, $or: [{ title: pattern }, { content: pattern }] };
    if (typeof req.query.project === 'string') {
      const project = await resolveProjectName(workspaceId, req.query.project);
      if (project === null) return void res.status(200).json([]);
      filter.project = { $eq: project };
    }
    const pages = await Page.find(filter).select('title project content updatedAt').sort({ updatedAt: -1 }).limit(SEARCH_LIMIT).lean();
    res.status(200).json(pages.map(page => ({
      _id: String(page._id),
      title: page.title,
      project: page.project,
      snippet: snippetAround(page.content, text),
      updatedAt: page.updatedAt,
    })));
  } catch (error) {
    handleError(res, error, 'searchPages');
  }
};

// ================================================================
// @desc    One page with its Markdown and the tasks it mentions
// @route   GET /api/workspaces/:slug/pages/:id
// ================================================================
export const getPage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await findPage(req);
    if (!page) return notFound(res);
    res.status(200).json(await presentFull(req, page));
  } catch (error) {
    handleError(res, error, 'getPage');
  }
};

// ================================================================
// @desc    Create a page (workspace-wide, or in a project); optional parent, at most 3 levels deep
// @route   POST /api/workspaces/:slug/pages
// ================================================================
export const createPage = async (req: Request, res: Response): Promise<void> => {
  if (hasValidationErrors(req, res)) return;
  try {
    const workspaceId = workspaceIdOf(req);
    const project = await resolveProjectName(workspaceId, req.body.project);
    if (project === null) throw new TaskRuleError('Project not found');

    let parent: mongoose.Types.ObjectId | null = null;
    if (req.body.parent) {
      parent = toObjectId(req.body.parent);
      const nodes = await loadNodes(workspaceId, project);
      if (!parent || !nodes.has(String(parent))) throw new TaskRuleError('The parent page was not found in this wiki');
      if (depthOf(String(parent), nodes) + 1 > MAX_PAGE_DEPTH) {
        throw new TaskRuleError(`Pages can be nested ${MAX_PAGE_DEPTH} levels deep at most`);
      }
    }

    const title = String(req.body.title).trim();
    const last = await Page.findOne({ workspace: workspaceId, project: { $eq: project }, parent }).sort({ position: -1 }).select('position').lean();
    const position = last ? last.position + 1 : 0;

    let created: IPage | null = null;
    // A concurrent create can take the slug between the lookup and the insert: retry with the next free one
    for (let attempt = 0; attempt < 3 && !created; attempt += 1) {
      const taken = new Set(await Page.distinct('slug', { workspace: workspaceId, project: { $eq: project } }));
      const slug = uniqueSlug(slugify(title), candidate => taken.has(candidate));
      try {
        created = await Page.create({
          workspace: workspaceId,
          project,
          parent,
          title,
          slug: attempt === 0 ? slug : `${slug}-${Math.random().toString(36).slice(2, 6)}`,
          content: typeof req.body.content === 'string' ? req.body.content : '',
          position,
          createdBy: req.user?._id,
          updatedBy: req.user?._id,
        });
      } catch (error) {
        if ((error as { code?: number } | null)?.code !== 11000 || attempt === 2) throw error;
      }
    }
    if (!created) throw new Error('Could not create the page');

    await recordActivity(req, {
      action: 'page.created',
      summary: title,
      changes: project ? [{ field: 'project', to: project }] : [],
    });
    const populated = await created.populate('createdBy updatedBy', USER_FIELDS);
    res.status(201).json(await presentFull(req, populated));
  } catch (error) {
    handleError(res, error, 'createPage');
  }
};

// ================================================================
// @desc    Edit title/content (or archive). Needs the `version` the caller edited; 409 with the latest page when it is stale.
// @route   PATCH /api/workspaces/:slug/pages/:id
// ================================================================
export const updatePage = async (req: Request, res: Response): Promise<void> => {
  if (hasValidationErrors(req, res)) return;
  try {
    const id = toObjectId(req.params.id);
    if (!id) return notFound(res);
    const current = await Page.findOne({ _id: id, workspace: workspaceIdOf(req) });
    if (!current) return notFound(res);
    const version = Number(req.body.version);
    if (current.version !== version) return await staleResponse(req, res, id);

    const set: Partial<Pick<IPage, 'title' | 'content' | 'archived'>> = {};
    const changes: { field: string; from?: string; to?: string }[] = [];
    if (typeof req.body.title === 'string' && req.body.title.trim() !== current.title) {
      set.title = req.body.title.trim();
      changes.push({ field: 'title', from: current.title, to: set.title });
    }
    if (typeof req.body.content === 'string' && req.body.content !== current.content) {
      set.content = req.body.content;
      changes.push({ field: 'content' });
    }
    if (typeof req.body.archived === 'boolean' && req.body.archived !== current.archived) {
      set.archived = req.body.archived;
      changes.push({ field: 'archived', from: String(current.archived), to: String(req.body.archived) });
    }

    if (changes.length === 0) {
      const same = await Page.findById(id).populate('createdBy updatedBy', USER_FIELDS);
      return void res.status(200).json(await presentFull(req, same ?? current));
    }

    const result = await applyEdit(req, id, version, set);
    if (!result) return await staleResponse(req, res, id);
    await recordActivity(req, { action: 'page.updated', summary: result.after.title, changes });
    res.status(200).json(await presentFull(req, result.after));
  } catch (error) {
    handleError(res, error, 'updatePage');
  }
};

// ================================================================
// @desc    Delete a page; its children move up one level. History goes with it.
// @route   DELETE /api/workspaces/:slug/pages/:id
// ================================================================
export const deletePage = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await findPage(req, false);
    if (!page) return notFound(res);
    const workspaceId = workspaceIdOf(req);
    await Page.updateMany({ workspace: workspaceId, parent: page._id }, { $set: { parent: page.parent ?? null } });
    await PageVersion.deleteMany({ page: page._id });
    await page.deleteOne();
    await recordActivity(req, { action: 'page.deleted', summary: page.title, changes: page.project ? [{ field: 'project', to: page.project }] : [] });
    res.status(200).json({ message: 'Page deleted', id: String(page._id) });
  } catch (error) {
    handleError(res, error, 'deletePage');
  }
};

// ================================================================
// @desc    Move a page under another parent (or to the top) at an index among its siblings
// @route   POST /api/workspaces/:slug/pages/:id/move   { parent: id|null, index?: number }
// ================================================================
export const movePage = async (req: Request, res: Response): Promise<void> => {
  if (hasValidationErrors(req, res)) return;
  try {
    const page = await findPage(req, false);
    if (!page) return notFound(res);
    const workspaceId = workspaceIdOf(req);
    const nodes = await loadNodes(workspaceId, page.project);

    const parentId = req.body.parent ? toObjectId(req.body.parent) : null;
    if (req.body.parent && (!parentId || !nodes.has(String(parentId)))) throw new TaskRuleError('The parent page was not found in this wiki');
    if (!canMoveUnder(String(page._id), parentId ? String(parentId) : null, nodes)) {
      throw new TaskRuleError(`A page cannot move under itself and pages nest ${MAX_PAGE_DEPTH} levels deep at most`);
    }

    const siblings = await Page.find({ workspace: workspaceId, project: { $eq: page.project }, parent: parentId, _id: { $ne: page._id } })
      .sort({ position: 1, title: 1 }).select('_id').lean();
    const order = siblings.map(sibling => sibling._id as mongoose.Types.ObjectId);
    const index = typeof req.body.index === 'number' ? Math.min(req.body.index, order.length) : order.length;
    order.splice(index, 0, page._id as mongoose.Types.ObjectId);

    await Page.bulkWrite(order.map((pageId, position) => ({
      updateOne: {
        filter: { _id: pageId, workspace: workspaceId },
        update: { $set: pageId.equals(page._id as mongoose.Types.ObjectId) ? { position, parent: parentId } : { position } },
      },
    })));
    await recordActivity(req, { action: 'page.updated', summary: page.title, changes: [{ field: 'position' }] });

    const pages = await Page.find({ workspace: workspaceId, project: { $eq: page.project } })
      .select('-content').sort({ position: 1, title: 1 }).populate('createdBy updatedBy', USER_FIELDS);
    res.status(200).json(pages.map(item => present(item, false)));
  } catch (error) {
    handleError(res, error, 'movePage');
  }
};

// ================================================================
// @desc    Earlier versions of a page (newest first, without content)
// @route   GET /api/workspaces/:slug/pages/:id/versions
// ================================================================
export const listVersions = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await findPage(req, false);
    if (!page) return notFound(res);
    const versions = await PageVersion.find({ page: page._id }).sort({ version: -1 }).limit(MAX_PAGE_VERSIONS)
      .select('-content').populate('editedBy', USER_FIELDS).lean();
    res.status(200).json({
      current: page.version,
      versions: versions.map(item => ({
        version: item.version,
        title: item.title,
        editedBy: presentUser(item.editedBy as UserRef),
        createdAt: item.createdAt,
      })),
    });
  } catch (error) {
    handleError(res, error, 'listVersions');
  }
};

const versionNumberOf = (req: Request): number | null => {
  const value = Number(req.params.version);
  return Number.isInteger(value) && value >= 1 ? value : null;
};

// ================================================================
// @desc    One earlier version with its Markdown
// @route   GET /api/workspaces/:slug/pages/:id/versions/:version
// ================================================================
export const getVersion = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await findPage(req, false);
    const number = versionNumberOf(req);
    if (!page || number === null) return notFound(res);
    const found = await PageVersion.findOne({ page: page._id, version: number }).populate('editedBy', USER_FIELDS);
    if (!found) return void res.status(404).json({ message: 'Version not found' });
    res.status(200).json({
      version: found.version,
      title: found.title,
      content: found.content,
      editedBy: presentUser(found.editedBy as UserRef),
      createdAt: found.createdAt,
    });
  } catch (error) {
    handleError(res, error, 'getVersion');
  }
};

// ================================================================
// @desc    Restore an earlier version as a new edit (the current text is kept in the history)
// @route   POST /api/workspaces/:slug/pages/:id/restore/:version
// ================================================================
export const restoreVersion = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = await findPage(req, false);
    const number = versionNumberOf(req);
    if (!page || number === null) return notFound(res);
    const old = await PageVersion.findOne({ page: page._id, version: number });
    if (!old) return void res.status(404).json({ message: 'Version not found' });

    const result = await applyEdit(req, page._id as mongoose.Types.ObjectId, page.version, { title: old.title, content: old.content });
    if (!result) return await staleResponse(req, res, page._id as mongoose.Types.ObjectId);
    await recordActivity(req, {
      action: 'page.updated',
      summary: result.after.title,
      changes: [{ field: 'restored', to: `version ${number}` }],
    });
    res.status(200).json(await presentFull(req, result.after));
  } catch (error) {
    handleError(res, error, 'restoreVersion');
  }
};
