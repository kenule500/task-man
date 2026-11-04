import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { body } from 'express-validator';
import SavedView, {
  ISavedView,
  MAX_SAVED_VIEWS_PER_USER,
  MAX_SAVED_VIEW_NAME,
  SAVED_VIEW_LAYOUTS,
} from '../models/savedViewModel.js';
import { normalizeViewQuery } from '../utils/savedViewQuery.js';
import { requireUserId } from '../utils/controllerHelpers.js';
import { handleError, hasValidationErrors, workspaceOf } from './taskController.js';

// ================================================================
// Validation
// ================================================================
const nameRule = () =>
  body('name').isString().trim().isLength({ min: 1, max: MAX_SAVED_VIEW_NAME }).withMessage(`Name is required (up to ${MAX_SAVED_VIEW_NAME} characters)`);
const otherRules = () => [
  body('view').optional().isIn(SAVED_VIEW_LAYOUTS).withMessage('Invalid view'),
  body('query').optional().custom(value => normalizeViewQuery(value) !== null).withMessage('The view has filters that cannot be saved'),
  body('shared').optional().isBoolean({ strict: true }).withMessage('shared must be true or false'),
];

export const validateCreateSavedView = [nameRule(), ...otherRules()];
export const validateUpdateSavedView = [nameRule().optional(), ...otherRules()];

// ================================================================
// Helpers
// ================================================================
const viewIdOf = (req: Request): string | null => {
  const id = String(req.params.id);
  return mongoose.isValidObjectId(id) ? id : null;
};

const canManageShared = (req: Request) => Boolean(req.permissions?.includes('settings:manage'));

interface PopulatedOwner { _id: mongoose.Types.ObjectId; name?: string }

/** API shape: the owner as `{ _id, name }` and a `mine` flag for the caller. */
const present = (doc: ISavedView, userId: string) => {
  const owner = doc.owner as unknown as mongoose.Types.ObjectId | PopulatedOwner;
  const ownerId = String((owner as PopulatedOwner)._id ?? owner);
  return {
    _id: String(doc._id),
    name: doc.name,
    view: doc.view,
    query: doc.query,
    shared: doc.shared,
    mine: ownerId === userId,
    owner: { _id: ownerId, name: (owner as PopulatedOwner).name ?? '' },
    createdAt: doc.createdAt,
  };
};

/** A view the caller can see: their own, or a shared one of the same workspace. */
const findVisible = (req: Request, userId: string) => {
  const id = viewIdOf(req);
  if (!id) return null;
  return SavedView.findOne({
    _id: id,
    workspace: workspaceOf(req)._id,
    $or: [{ owner: userId }, { shared: true }],
  });
};

// ================================================================
// @desc    The caller's views plus the shared ones of the workspace
// @route   GET /api/workspaces/:slug/views
// @desc    Requires tasks:read (enforced by route middleware)
// ================================================================
export const listSavedViews = async (req: Request, res: Response): Promise<void> => {
  const userId = requireUserId(req, res);
  if (!userId) return;
  try {
    const views = await SavedView.find({
      workspace: workspaceOf(req)._id,
      $or: [{ owner: userId }, { shared: true }],
    })
      .sort({ createdAt: 1 })
      .populate('owner', 'name');
    res.status(200).json(views.map(view => present(view, userId)));
  } catch (error) {
    handleError(res, error, 'listSavedViews');
  }
};

// ================================================================
// @desc    Save a view
// @route   POST /api/workspaces/:slug/views
// ================================================================
export const createSavedView = async (req: Request, res: Response): Promise<void> => {
  if (hasValidationErrors(req, res)) return;
  const userId = requireUserId(req, res);
  if (!userId) return;
  try {
    const workspaceId = workspaceOf(req)._id;
    const count = await SavedView.countDocuments({ workspace: workspaceId, owner: userId });
    if (count >= MAX_SAVED_VIEWS_PER_USER) {
      res.status(400).json({ message: `You can save up to ${MAX_SAVED_VIEWS_PER_USER} views. Delete one first.` });
      return;
    }
    const created = await SavedView.create({
      workspace: workspaceId,
      owner: userId,
      name: String(req.body.name).trim(),
      view: req.body.view,
      query: normalizeViewQuery(req.body.query ?? '') ?? '',
      shared: req.body.shared === true,
    });
    const populated = await created.populate('owner', 'name');
    res.status(201).json(present(populated, userId));
  } catch (error) {
    handleError(res, error, 'createSavedView');
  }
};

// ================================================================
// @desc    Rename, change or (un)share a view. The owner can change everything;
//          settings:manage can edit the name, layout and filters of shared views.
// @route   PATCH /api/workspaces/:slug/views/:id
// ================================================================
export const updateSavedView = async (req: Request, res: Response): Promise<void> => {
  if (hasValidationErrors(req, res)) return;
  const userId = requireUserId(req, res);
  if (!userId) return;
  try {
    const saved = await findVisible(req, userId);
    if (!saved) {
      res.status(404).json({ message: 'View not found' });
      return;
    }
    const isOwner = String(saved.owner) === userId;
    if (!isOwner && !(saved.shared && canManageShared(req))) {
      res.status(403).json({ message: 'Only the owner can change this view' });
      return;
    }
    if (!isOwner && req.body.shared !== undefined) {
      res.status(403).json({ message: 'Only the owner can change who sees this view' });
      return;
    }

    if (req.body.name !== undefined) saved.name = String(req.body.name).trim();
    if (req.body.view !== undefined) saved.view = req.body.view;
    if (req.body.query !== undefined) saved.query = normalizeViewQuery(req.body.query) ?? '';
    if (req.body.shared !== undefined) saved.shared = req.body.shared === true;
    await saved.save();

    const populated = await saved.populate('owner', 'name');
    res.status(200).json(present(populated, userId));
  } catch (error) {
    handleError(res, error, 'updateSavedView');
  }
};

// ================================================================
// @desc    Delete a view (owner, or settings:manage for shared views)
// @route   DELETE /api/workspaces/:slug/views/:id
// ================================================================
export const deleteSavedView = async (req: Request, res: Response): Promise<void> => {
  const userId = requireUserId(req, res);
  if (!userId) return;
  try {
    const saved = await findVisible(req, userId);
    if (!saved) {
      res.status(404).json({ message: 'View not found' });
      return;
    }
    const isOwner = String(saved.owner) === userId;
    if (!isOwner && !(saved.shared && canManageShared(req))) {
      res.status(403).json({ message: 'Only the owner can delete this view' });
      return;
    }
    await saved.deleteOne();
    res.status(200).json({ message: 'View deleted' });
  } catch (error) {
    handleError(res, error, 'deleteSavedView');
  }
};
