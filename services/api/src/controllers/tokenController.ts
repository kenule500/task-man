import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { body } from 'express-validator';
import ApiToken, { IApiToken } from '../models/apiTokenModel.js';
import { PERMISSIONS } from '../config/permissions.js';
import {
  MAX_ACTIVE_TOKENS_PER_USER,
  MAX_TOKEN_LIFETIME_DAYS,
  MAX_TOKEN_NAME,
  expiryFromDays,
  generateApiToken,
  isPermissionKey,
  scopesWithinPermissions,
} from '../utils/apiTokens.js';
import { requireUserId } from '../utils/controllerHelpers.js';
import { recordActivity } from '../utils/activity.js';
import { handleError, hasValidationErrors, workspaceOf } from './taskController.js';

// ================================================================
// Validation
// ================================================================
const DAY_MS = 24 * 60 * 60 * 1000;

export const validateCreateToken = [
  body('name').isString().trim().isLength({ min: 1, max: MAX_TOKEN_NAME })
    .withMessage(`Name is required (up to ${MAX_TOKEN_NAME} characters)`),
  body('scopes').isArray({ min: 1, max: Object.keys(PERMISSIONS).length }).withMessage('Choose at least one scope'),
  body('scopes.*').custom(isPermissionKey).withMessage('Unknown scope'),
  body('expiresInDays').optional({ values: 'null' }).isInt({ min: 1, max: MAX_TOKEN_LIFETIME_DAYS })
    .withMessage(`Expiry must be between 1 and ${MAX_TOKEN_LIFETIME_DAYS} days`),
  body('expiresAt').optional({ values: 'null' }).isISO8601().withMessage('Invalid expiry date')
    .bail()
    .custom(value => {
      const time = new Date(value).getTime();
      return time > Date.now() && time <= Date.now() + MAX_TOKEN_LIFETIME_DAYS * DAY_MS;
    })
    .withMessage('Expiry must be in the future and within one year'),
];

// ================================================================
// Helpers
// ================================================================
const present = (doc: IApiToken) => ({
  _id: String(doc._id),
  name: doc.name,
  prefix: doc.prefix,
  scopes: doc.scopes,
  expiresAt: doc.expiresAt,
  lastUsedAt: doc.lastUsedAt,
  createdAt: doc.createdAt,
  mine: true,
});

const activeFilter = (workspace: mongoose.Types.ObjectId, user: string) => ({
  workspace,
  user: { $eq: user },
  revokedAt: null,
  $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
});

// ================================================================
// @desc    The caller's active tokens in this workspace (never the secret)
// @route   GET /api/workspaces/:slug/tokens
// ================================================================
export const listTokens = async (req: Request, res: Response): Promise<void> => {
  const userId = requireUserId(req, res);
  if (!userId) return;
  try {
    const tokens = await ApiToken.find({ workspace: workspaceOf(req)._id, user: { $eq: userId }, revokedAt: null })
      .sort({ createdAt: -1 });
    res.status(200).json(tokens.map(present));
  } catch (error) {
    handleError(res, error, 'listTokens');
  }
};

// ================================================================
// @desc    Create a token; the plain value is in this response only
// @route   POST /api/workspaces/:slug/tokens
// ================================================================
export const createToken = async (req: Request, res: Response): Promise<void> => {
  if (hasValidationErrors(req, res)) return;
  const userId = requireUserId(req, res);
  if (!userId) return;
  try {
    const workspace = workspaceOf(req);
    const scopes = [...new Set((req.body.scopes as unknown[]).map(String))];
    if (!scopesWithinPermissions(scopes, req.permissions ?? [])) {
      res.status(403).json({ message: 'A token cannot have scopes you do not have yourself' });
      return;
    }

    const active = await ApiToken.countDocuments(activeFilter(workspace._id, userId));
    if (active >= MAX_ACTIVE_TOKENS_PER_USER) {
      res.status(400).json({ message: `You can have up to ${MAX_ACTIVE_TOKENS_PER_USER} active tokens. Revoke one first.` });
      return;
    }

    const expiresAt = req.body.expiresAt
      ? new Date(req.body.expiresAt)
      : expiryFromDays(req.body.expiresInDays === undefined || req.body.expiresInDays === null ? null : Number(req.body.expiresInDays));

    const generated = generateApiToken();
    const created = await ApiToken.create({
      workspace: workspace._id,
      user: userId,
      name: String(req.body.name).trim(),
      prefix: generated.prefix,
      tokenHash: generated.hash,
      scopes,
      expiresAt,
    });
    await recordActivity(req, {
      action: 'token.created',
      summary: created.name,
      changes: [{ field: 'scopes', to: scopes.join(', ') }],
    });
    res.status(201).json({ ...present(created), token: generated.token });
  } catch (error) {
    handleError(res, error, 'createToken');
  }
};

// ================================================================
// @desc    Revoke a token: the caller's own, or any in the workspace with settings:manage
// @route   DELETE /api/workspaces/:slug/tokens/:id
// ================================================================
export const revokeToken = async (req: Request, res: Response): Promise<void> => {
  const userId = requireUserId(req, res);
  if (!userId) return;
  try {
    const id = String(req.params.id);
    if (!mongoose.isValidObjectId(id)) {
      res.status(404).json({ message: 'Token not found' });
      return;
    }
    const canManage = Boolean(req.permissions?.includes('settings:manage'));
    const filter: Record<string, unknown> = { _id: { $eq: id }, workspace: workspaceOf(req)._id, revokedAt: null };
    if (!canManage) filter.user = { $eq: userId };

    const token = await ApiToken.findOneAndUpdate(filter, { $set: { revokedAt: new Date() } }, { returnDocument: 'after' });
    if (!token) {
      res.status(404).json({ message: 'Token not found' });
      return;
    }
    await recordActivity(req, { action: 'token.revoked', summary: token.name });
    res.status(200).json({ message: 'Token revoked' });
  } catch (error) {
    handleError(res, error, 'revokeToken');
  }
};
