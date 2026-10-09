import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Activity, { ACTIVITY_ACTIONS, ACTIVITY_RETENTION_DAYS } from '../models/activityModel.js';
import Task from '../models/taskModel.js';
import { recordActivity } from '../utils/activity.js';
import { PUBLIC_USER_FIELDS, handleError, workspaceOf } from './taskController.js';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const MAX_EXPORT_ROWS = 5000;
const AREAS = [...new Set(ACTIVITY_ACTIONS.map(action => action.split('.')[0]))];

const parseLimit = (value: unknown) => {
  const limit = Number(value);
  return Number.isInteger(limit) && limit > 0 ? Math.min(limit, MAX_LIMIT) : DEFAULT_LIMIT;
};

/** `before` cursor: entries strictly older than this ISO date (the "Older" page). */
const parseBefore = (value: unknown): Date | undefined => {
  if (typeof value !== 'string' || !value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
};

/** One page of entries plus the cursor of the next (older) page. */
const page = async (filter: Record<string, unknown>, limit: number) => {
  const entries = await Activity.find(filter)
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit + 1)
    .populate('actor', PUBLIC_USER_FIELDS)
    .select('-__v -workspace')
    .lean();
  const hasMore = entries.length > limit;
  const items = hasMore ? entries.slice(0, limit) : entries;
  return { items, nextBefore: hasMore ? items[items.length - 1].createdAt.toISOString() : null };
};

// RFC 4180: quote every field, double the quotes inside; neutralise spreadsheet formulas
const csvCell = (value: unknown) => {
  let text = value === undefined || value === null ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
};

export const toAuditCsv = (entries: {
  createdAt: Date; action: string; summary?: string; actor?: { name?: string } | null;
  changes?: { field: string; from?: string; to?: string }[]; ip?: string; userAgent?: string;
}[]) => {
  const header = ['time', 'actor', 'action', 'subject', 'changes', 'ip', 'user_agent'];
  const rows = entries.map(entry => [
    entry.createdAt.toISOString(),
    entry.actor?.name ?? '',
    entry.action,
    entry.summary ?? '',
    (entry.changes ?? []).map(change => `${change.field}: ${change.from ?? '–'} → ${change.to ?? '–'}`).join('; '),
    entry.ip ?? '',
    entry.userAgent ?? '',
  ]);
  return [header, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n');
};

/**
 * @desc    History of one task (field changes, comments, files), newest first
 * @route   GET /api/workspaces/:slug/tasks/:id/activity?limit=&before=
 */
export const getTaskActivity = async (req: Request, res: Response): Promise<void> => {
  try {
    const workspace = workspaceOf(req);
    const id = String(req.params.id);
    if (!mongoose.isValidObjectId(id) || !(await Task.exists({ _id: id, workspace: workspace._id }))) {
      res.status(404).json({ message: 'Task not found' });
      return;
    }
    const filter: Record<string, unknown> = { workspace: workspace._id, task: id };
    const before = parseBefore(req.query.before);
    if (before) filter.createdAt = { $lt: before };

    res.status(200).json(await page(filter, parseLimit(req.query.limit)));
  } catch (error) {
    handleError(res, error, 'getTaskActivity');
  }
};

/**
 * @desc    Workspace audit log (owners/admins), newest first; `format=csv` downloads it
 * @route   GET /api/workspaces/:slug/activity?area=&actor=&before=&limit=&format=csv
 */
export const getWorkspaceActivity = async (req: Request, res: Response): Promise<void> => {
  try {
    const workspace = workspaceOf(req);
    const filter: Record<string, unknown> = { workspace: workspace._id };

    const area = typeof req.query.area === 'string' ? req.query.area : '';
    if (AREAS.includes(area)) filter.action = { $regex: `^${area}\\.` };
    const actor = typeof req.query.actor === 'string' ? req.query.actor : '';
    if (mongoose.isValidObjectId(actor)) filter.actor = new mongoose.Types.ObjectId(actor);
    const before = parseBefore(req.query.before);
    if (before) filter.createdAt = { $lt: before };

    if (req.query.format === 'csv') {
      const entries = await Activity.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .limit(MAX_EXPORT_ROWS)
        .populate('actor', 'name')
        .lean();
      await recordActivity(req, { action: 'audit.exported', summary: `${entries.length} entries`, changes: area ? [{ field: 'area', to: area }] : [] });
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="audit-${workspace.slug}-${new Date().toISOString().slice(0, 10)}.csv"`);
      res.status(200).send(`﻿${toAuditCsv(entries as never)}`);
      return;
    }

    res.status(200).json({ ...(await page(filter, parseLimit(req.query.limit))), retentionDays: ACTIVITY_RETENTION_DAYS, areas: AREAS });
  } catch (error) {
    handleError(res, error, 'getWorkspaceActivity');
  }
};
