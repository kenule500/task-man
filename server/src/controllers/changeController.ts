import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { body, query } from 'express-validator';
import Activity from '../models/activityModel.js';
import Presence, { PRESENCE_TTL_SECONDS } from '../models/presenceModel.js';
import Task from '../models/taskModel.js';
import { EMPTY_CURSOR, afterCursor, formatCursor, hiddenActions, parseCursor } from '../utils/changeCursor.js';
import { PUBLIC_USER_FIELDS, handleError, hasValidationErrors, workspaceOf } from './taskController.js';

// More new entries than this and the client reloads everything instead of replaying them
export const MAX_CHANGES = 200;
const MAX_VIEWERS = 20;

const noStore = (res: Response) => {
  res.setHeader('Cache-Control', 'no-store');
};

const permissionsOf = (req: Request): string[] => (req as { permissions?: string[] }).permissions ?? [];

const toObjectId = (value: unknown): mongoose.Types.ObjectId | null =>
  typeof value === 'string' && mongoose.isValidObjectId(value) ? new mongoose.Types.ObjectId(value) : null;

export const validateChanges = [
  query('since').optional().isString().isLength({ max: 40 }).withMessage('Invalid cursor'),
];
export const validatePresence = [
  body('taskId').isMongoId().withMessage('Invalid task'),
];
export const validatePresenceQuery = [
  query('task').isMongoId().withMessage('Invalid task'),
];

/**
 * @desc    What changed in the workspace since a cursor (poll this instead of holding a socket open)
 * @route   GET /api/workspaces/:slug/changes?since=<cursor or ISO date>
 *          Without `since` it only returns the current cursor to start from.
 *          More than 200 new entries: `reset: true` and no entries (reload everything, continue from `cursor`).
 */
export const getChanges = async (req: Request, res: Response): Promise<void> => {
  noStore(res);
  if (hasValidationErrors(req, res)) return;

  try {
    const workspaceId = workspaceOf(req)._id;
    const hidden = hiddenActions(permissionsOf(req));
    const scope: Record<string, unknown> = { workspace: workspaceId };
    if (hidden.length > 0) scope.action = { $nin: hidden };

    const rawSince = req.query.since;
    const hasSince = typeof rawSince === 'string' && rawSince !== '';
    const cursor = hasSince ? parseCursor(rawSince) : null;
    if (hasSince && !cursor) {
      res.status(400).json({ message: 'Invalid cursor' });
      return;
    }

    const newestCursor = async () => {
      const latest = await Activity.findOne(scope).sort({ createdAt: -1, _id: -1 }).select('createdAt').lean();
      return latest ? formatCursor(latest) : EMPTY_CURSOR;
    };

    if (!cursor) {
      res.status(200).json({ cursor: await newestCursor(), changes: [] });
      return;
    }

    const entries = await Activity.find({ ...scope, ...afterCursor(cursor) })
      .sort({ createdAt: 1, _id: 1 })
      .limit(MAX_CHANGES + 1)
      .select('action summary task project sprint actor changes createdAt')
      .populate('actor', PUBLIC_USER_FIELDS)
      .lean();

    if (entries.length > MAX_CHANGES) {
      // Too far behind: point the client at the newest entry so it can reload and carry on from there
      res.status(200).json({ cursor: await newestCursor(), changes: [], reset: true });
      return;
    }

    const last = entries[entries.length - 1];
    res.status(200).json({
      cursor: last ? formatCursor(last) : rawSince,
      changes: entries.map(entry => {
        const actor = entry.actor as unknown as { _id: mongoose.Types.ObjectId; name?: string } | null;
        return {
          id: String(entry._id),
          action: entry.action,
          task: entry.task ? String(entry.task) : undefined,
          project: entry.project ? String(entry.project) : undefined,
          sprint: entry.sprint ? String(entry.sprint) : undefined,
          actor: actor?._id ? { _id: String(actor._id), name: actor.name ?? '' } : null,
          summary: entry.summary,
          fields: (entry.changes ?? []).map(({ field, from, to }) => ({ field, from, to })),
          at: entry.createdAt.toISOString(),
        };
      }),
    });
  } catch (error) {
    handleError(res, error, 'getChanges');
  }
};

/**
 * @desc    "I have this task open" heartbeat (expires after 60 s without one)
 * @route   POST /api/workspaces/:slug/changes/presence   { taskId }
 */
export const heartbeatPresence = async (req: Request, res: Response): Promise<void> => {
  noStore(res);
  if (hasValidationErrors(req, res)) return;

  try {
    const workspaceId = workspaceOf(req)._id;
    const taskId = toObjectId(req.body.taskId);
    const userId = toObjectId(String(req.user?._id));
    if (!taskId || !userId || !(await Task.exists({ _id: taskId, workspace: workspaceId }))) {
      res.status(404).json({ message: 'Task not found' });
      return;
    }
    await Presence.updateOne(
      { workspace: workspaceId, task: taskId, user: userId },
      { $set: { seenAt: new Date() } },
      { upsert: true },
    );
    res.status(204).end();
  } catch (error) {
    handleError(res, error, 'heartbeatPresence');
  }
};

/**
 * @desc    The other people who have the task open right now
 * @route   GET /api/workspaces/:slug/changes/presence?task=<id>
 */
export const getPresence = async (req: Request, res: Response): Promise<void> => {
  noStore(res);
  if (hasValidationErrors(req, res)) return;

  try {
    const workspaceId = workspaceOf(req)._id;
    const taskId = toObjectId(req.query.task);
    const userId = toObjectId(String(req.user?._id));
    if (!taskId || !userId) {
      res.status(404).json({ message: 'Task not found' });
      return;
    }
    // The TTL monitor only runs about once a minute, so also ignore stale rows here
    const fresh = new Date(Date.now() - PRESENCE_TTL_SECONDS * 1000);
    const rows = await Presence.find({
      workspace: workspaceId, task: taskId, user: { $ne: userId }, seenAt: { $gt: fresh },
    })
      .sort({ seenAt: -1 })
      .limit(MAX_VIEWERS)
      .populate('user', PUBLIC_USER_FIELDS)
      .select('user')
      .lean();
    const viewers = rows
      .map(row => row.user as unknown as { _id: mongoose.Types.ObjectId; name?: string; avatarUrl?: string } | null)
      .filter((user): user is NonNullable<typeof user> => Boolean(user?._id))
      .map(user => ({ _id: String(user._id), name: user.name ?? '', avatarUrl: user.avatarUrl }));
    res.status(200).json({ viewers });
  } catch (error) {
    handleError(res, error, 'getPresence');
  }
};

/**
 * @desc    I closed the task
 * @route   DELETE /api/workspaces/:slug/changes/presence?task=<id>
 */
export const leavePresence = async (req: Request, res: Response): Promise<void> => {
  noStore(res);
  if (hasValidationErrors(req, res)) return;

  try {
    const taskId = toObjectId(req.query.task);
    const userId = toObjectId(String(req.user?._id));
    if (taskId && userId) {
      await Presence.deleteOne({ workspace: workspaceOf(req)._id, task: taskId, user: userId });
    }
    res.status(204).end();
  } catch (error) {
    handleError(res, error, 'leavePresence');
  }
};
