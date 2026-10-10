import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Notification from '../models/notificationModel.js';
import Project from '../models/projectModel.js';
import Workspace from '../models/workspaceModel.js';

// A signed-in user's own notifications. Every query filters by req.user, so one user can
// never read or change another's; routes sit behind `protect` only (no workspace permission).

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
// Matches the client's key prefix for tasks without a project
const DEFAULT_KEY_PREFIX = 'TM';

const userId = (req: Request): mongoose.Types.ObjectId => req.user?._id as mongoose.Types.ObjectId;

/** Notifications of workspaces the user still belongs to. */
const scopeOf = async (req: Request) => {
  const workspaces = await Workspace.find({ 'members.user': userId(req) }).select('_id').lean();
  return { user: userId(req), workspace: { $in: workspaces.map(w => w._id) } };
};

const parseLimit = (value: unknown): number => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, MAX_LIMIT) : DEFAULT_LIMIT;
};

/** Cursor "<createdAt ms>_<id>" of the last item returned. */
const encodeCursor = (item: { createdAt: Date; _id: unknown }): string =>
  `${item.createdAt.getTime()}_${String(item._id)}`;
const decodeCursor = (value: unknown): { createdAt: Date; id: mongoose.Types.ObjectId } | null => {
  const match = /^(\d{1,15})_([a-f0-9]{24})$/i.exec(typeof value === 'string' ? value : '');
  return match ? { createdAt: new Date(Number(match[1])), id: new mongoose.Types.ObjectId(match[2]) } : null;
};

type Populated = {
  _id: mongoose.Types.ObjectId;
  type: string;
  summary: string;
  readAt?: Date | null;
  createdAt: Date;
  actor: { _id: unknown; name: string; avatarUrl?: string } | null;
  task: { _id: mongoose.Types.ObjectId; title: string; number?: number; project?: string } | null;
  workspace: { _id: mongoose.Types.ObjectId; slug: string; name: string } | null;
};

// ================================================================
// @desc    The caller's notifications, newest first (cursor pagination)
// @route   GET /api/notifications?unread=1&limit=20&before=<cursor>
// ================================================================
export const listNotifications = async (req: Request, res: Response): Promise<void> => {
  try {
    const limit = parseLimit(req.query.limit);
    const scope = await scopeOf(req);
    const filter: Record<string, unknown> = { ...scope };
    if (req.query.unread === '1' || req.query.unread === 'true') filter.readAt = null;

    const cursor = decodeCursor(req.query.before);
    if (req.query.before !== undefined && !cursor) {
      res.status(400).json({ message: 'Invalid cursor' });
      return;
    }
    if (cursor) {
      filter.$or = [
        { createdAt: { $lt: cursor.createdAt } },
        { createdAt: cursor.createdAt, _id: { $lt: cursor.id } },
      ];
    }

    const [rows, unreadCount] = await Promise.all([
      Notification.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .limit(limit + 1)
        .populate('actor', 'name avatarUrl')
        .populate('task', 'title number project')
        .populate('workspace', 'slug name')
        .lean(),
      Notification.countDocuments({ ...scope, readAt: null }),
    ]);

    const hasMore = rows.length > limit;
    const page = (hasMore ? rows.slice(0, limit) : rows) as unknown as Populated[];

    // Task keys are "<project key>-<number>"; look the project keys up in one query
    const named = page.filter(row => row.task?.project && row.workspace);
    const projects = named.length > 0
      ? await Project.find({
        workspace: { $in: [...new Set(named.map(row => String(row.workspace?._id)))] },
        nameKey: { $in: [...new Set(named.map(row => (row.task?.project ?? '').toLowerCase()))] },
      }).select('workspace nameKey key').lean()
      : [];
    const keyOf = new Map(projects.map(p => [`${String(p.workspace)}:${p.nameKey}`, p.key]));

    const keyFor = (row: Populated): string => {
      if (typeof row.task?.number !== 'number') return '';
      const project = row.task.project && row.workspace
        ? keyOf.get(`${String(row.workspace._id)}:${row.task.project.toLowerCase()}`)
        : undefined;
      return `${project || DEFAULT_KEY_PREFIX}-${row.task.number}`;
    };

    const items = page.map(row => ({
      _id: row._id,
      type: row.type,
      summary: row.summary,
      readAt: row.readAt ?? null,
      createdAt: row.createdAt,
      actor: row.actor ? { _id: row.actor._id, name: row.actor.name, avatarUrl: row.actor.avatarUrl ?? '' } : null,
      task: row.task
        ? { _id: row.task._id, title: row.task.title, number: row.task.number ?? null, key: keyFor(row) }
        : null,
      workspace: row.workspace ? { _id: row.workspace._id, slug: row.workspace.slug, name: row.workspace.name } : null,
    }));

    res.status(200).json({
      items,
      nextBefore: hasMore && page.length > 0 ? encodeCursor(page[page.length - 1]) : null,
      unreadCount,
    });
  } catch (error) {
    console.error('listNotifications error:', (error as Error).message);
    res.status(500).json({ message: 'Could not load notifications' });
  }
};

// ================================================================
// @desc    Mark one of the caller's notifications as read (idempotent)
// @route   POST /api/notifications/:id/read
// ================================================================
export const markNotificationRead = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = String(req.params.id);
    if (!mongoose.isValidObjectId(id)) {
      res.status(404).json({ message: 'Notification not found' });
      return;
    }
    const mine = { _id: id, user: userId(req) };
    const updated = await Notification.updateOne({ ...mine, readAt: null }, { $set: { readAt: new Date() } });
    if (!updated.matchedCount && !(await Notification.exists(mine))) {
      res.status(404).json({ message: 'Notification not found' });
      return;
    }
    const unreadCount = await Notification.countDocuments({ ...(await scopeOf(req)), readAt: null });
    res.status(200).json({ id, unreadCount });
  } catch (error) {
    console.error('markNotificationRead error:', (error as Error).message);
    res.status(500).json({ message: 'Could not update the notification' });
  }
};

// ================================================================
// @desc    Mark all of the caller's notifications as read
// @route   POST /api/notifications/read-all
// ================================================================
export const markAllNotificationsRead = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await Notification.updateMany({ user: userId(req), readAt: null }, { $set: { readAt: new Date() } });
    res.status(200).json({ updated: result.modifiedCount, unreadCount: 0 });
  } catch (error) {
    console.error('markAllNotificationsRead error:', (error as Error).message);
    res.status(500).json({ message: 'Could not update notifications' });
  }
};
