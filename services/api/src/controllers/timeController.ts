import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { body } from 'express-validator';
import Task from '../models/taskModel.js';
import Project from '../models/projectModel.js';
import TimeEntry, { MAX_TIME_NOTE_LENGTH, type ITimeEntry } from '../models/timeEntryModel.js';
import { auditLookup, recordActivity } from '../utils/activity.js';
import {
  dayKey,
  formatMinutes,
  MAX_ENTRY_MINUTES,
  minutesBetween,
  parseRangeBound,
  summarizeEntries,
  timerEnd,
  toCsvRows,
} from '../utils/timeTracking.js';
import { handleError, hasValidationErrors, PUBLIC_USER_FIELDS, workspaceOf } from './taskController.js';

// Time entries of tasks and the workspace timesheet. Routes guard these with requirePermission,
// so req.workspace / req.permissions are always set.

const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 86_400_000;
const TIMESHEET_LIMIT = 5000;
const EXPORT_LIMIT = 20000;
const DEFAULT_KEY_PREFIX = 'TM';

type Id = mongoose.Types.ObjectId;

const castId = (value: unknown): Id | null =>
  typeof value === 'string' && mongoose.isValidObjectId(value) ? new mongoose.Types.ObjectId(value) : null;

const hasPermission = (req: Request, permission: string): boolean =>
  Boolean(req.permissions?.includes(permission));

const userIdOf = (req: Request): Id | null => castId(String(req.user?._id ?? ''));

// ================================================================
// Validation
// ================================================================
export const validateTimeEntry = [
  body('minutes').optional().isInt({ min: 1, max: MAX_ENTRY_MINUTES })
    .withMessage(`Minutes must be a whole number from 1 to ${MAX_ENTRY_MINUTES}`),
  body('startedAt').optional().isISO8601().withMessage('Invalid start time'),
  body('endedAt').optional().isISO8601().withMessage('Invalid end time'),
  body('note').optional().isString().withMessage('Note must be text')
    .bail()
    .isLength({ max: MAX_TIME_NOTE_LENGTH }).withMessage(`Note can be at most ${MAX_TIME_NOTE_LENGTH} characters`),
  body().custom((value: Record<string, unknown>) => {
    if (value?.minutes !== undefined) return true;
    if (value?.startedAt !== undefined && value?.endedAt !== undefined) return true;
    throw new Error('Give the minutes, or a start and an end time');
  }),
];

// ================================================================
// Serialisation
// ================================================================
interface PopulatedUser { _id: Id; name?: string; avatarUrl?: string }
interface PopulatedTask { _id: Id; title: string; number?: number; project?: string }

const taskKeyOf = (task: PopulatedTask, keys: Map<string, string>): string =>
  typeof task.number === 'number' ? `${keys.get(task.project ?? '') ?? DEFAULT_KEY_PREFIX}-${task.number}` : '';

/** Project name -> key for the given tasks. */
const projectKeysFor = async (workspaceId: Id, tasks: PopulatedTask[]): Promise<Map<string, string>> => {
  const names = [...new Set(tasks.map(task => task.project).filter((name): name is string => Boolean(name)))];
  if (names.length === 0) return new Map();
  const projects = await Project.find({ workspace: workspaceId, name: { $in: names } }).select('name key').lean();
  return new Map(projects.map(project => [project.name, project.key]));
};

const publicEntry = (entry: ITimeEntry) => {
  const { __v, running, ...rest } = entry.toObject() as unknown as Record<string, unknown>;
  void __v;
  return { ...rest, running: Boolean(running) };
};

/** Sets a task's denormalised loggedMinutes to the sum of its stopped entries and returns it. */
const syncLogged = async (taskId: Id): Promise<number> => {
  const [sum] = await TimeEntry.aggregate<{ total: number }>([
    { $match: { task: taskId, running: { $ne: true } } },
    { $group: { _id: null, total: { $sum: '$minutes' } } },
  ]);
  const total = sum?.total ?? 0;
  await Task.updateOne({ _id: taskId }, { $set: { loggedMinutes: total } });
  return total;
};

const loadTask = async (req: Request, fields: string) => {
  const id = castId(req.params.id);
  if (!id) return null;
  return Task.findOne({ _id: id, workspace: workspaceOf(req)._id }).select(fields).lean();
};

/** Ends a running timer (at most a day is counted) and returns the stopped entry, or null when it was already stopped. */
const stopEntry = async (entry: { _id: Id; startedAt: Date }, now: Date): Promise<ITimeEntry | null> => {
  const endedAt = timerEnd(entry.startedAt, now);
  return TimeEntry.findOneAndUpdate(
    { _id: entry._id, running: { $eq: true } },
    { $set: { endedAt, minutes: minutesBetween(entry.startedAt, endedAt), running: false } },
    { returnDocument: 'after' },
  );
};

const logActivity = async (req: Request, action: 'time.logged' | 'time.deleted', taskId: Id, minutes: number) => {
  const task = await auditLookup(() => Task.findById(taskId).select('title').lean());
  await recordActivity(req, {
    action,
    summary: task?.title ?? '',
    task: taskId,
    changes: [{ field: 'time', ...(action === 'time.logged' ? { to: formatMinutes(minutes) } : { from: formatMinutes(minutes) }) }],
  });
};

// ================================================================
// @desc    Time entries of one task, with the estimate and the running timer of the caller
// @route   GET /api/workspaces/:slug/tasks/:id/time   (tasks:read)
// ================================================================
export const getTaskTime = async (req: Request, res: Response): Promise<void> => {
  try {
    const task = await loadTask(req, 'estimateMinutes loggedMinutes');
    if (!task) {
      res.status(404).json({ message: 'Task not found' });
      return;
    }
    const entries = await TimeEntry.find({ workspace: workspaceOf(req)._id, task: task._id })
      .sort({ startedAt: -1 })
      .limit(500)
      .populate('user', PUBLIC_USER_FIELDS)
      .select('-__v')
      .lean();
    const me = String(req.user?._id ?? '');
    const running = entries.find(entry => entry.running && String((entry.user as unknown as PopulatedUser)?._id) === me);
    res.status(200).json({
      estimateMinutes: task.estimateMinutes ?? null,
      loggedMinutes: task.loggedMinutes ?? 0,
      running: running ?? null,
      entries: entries.map(entry => ({ ...entry, running: Boolean(entry.running) })),
    });
  } catch (error) {
    handleError(res, error, 'getTaskTime');
  }
};

// ================================================================
// @desc    Log time by hand: { minutes, startedAt?, note? } or { startedAt, endedAt, note? }
// @route   POST /api/workspaces/:slug/tasks/:id/time   (tasks:write)
// ================================================================
export const addTimeEntry = async (req: Request, res: Response): Promise<void> => {
  if (hasValidationErrors(req, res)) return;

  try {
    const userId = userIdOf(req);
    if (!userId) {
      res.status(401).json({ message: 'Not authorized' });
      return;
    }
    const task = await loadTask(req, '_id');
    if (!task) {
      res.status(404).json({ message: 'Task not found' });
      return;
    }

    const now = new Date();
    let startedAt: Date;
    let endedAt: Date;
    let minutes: number;
    if (req.body.minutes !== undefined) {
      minutes = Number(req.body.minutes);
      startedAt = req.body.startedAt !== undefined
        ? new Date(String(req.body.startedAt))
        : new Date(now.getTime() - minutes * MS_PER_MINUTE);
      endedAt = new Date(startedAt.getTime() + minutes * MS_PER_MINUTE);
    } else {
      startedAt = new Date(String(req.body.startedAt));
      endedAt = new Date(String(req.body.endedAt));
      const length = Math.round((endedAt.getTime() - startedAt.getTime()) / MS_PER_MINUTE);
      if (length < 1 || length > MAX_ENTRY_MINUTES) {
        res.status(400).json({ message: `The end must be after the start, at most ${MAX_ENTRY_MINUTES} minutes later` });
        return;
      }
      minutes = length;
    }
    if (startedAt.getTime() > now.getTime() + MS_PER_DAY) {
      res.status(400).json({ message: 'You cannot log time more than a day ahead' });
      return;
    }

    const entry = await TimeEntry.create({
      workspace: workspaceOf(req)._id,
      task: task._id,
      user: userId,
      startedAt,
      endedAt,
      minutes,
      note: typeof req.body.note === 'string' ? req.body.note : '',
      running: false,
    });
    const loggedMinutes = await syncLogged(task._id as Id);
    await logActivity(req, 'time.logged', task._id as Id, minutes);
    res.status(201).json({ entry: publicEntry(entry), loggedMinutes });
  } catch (error) {
    handleError(res, error, 'addTimeEntry');
  }
};

// ================================================================
// @desc    Start a timer on a task; a timer running elsewhere is stopped (and logged) first
// @route   POST /api/workspaces/:slug/tasks/:id/timer/start   (tasks:write)
// ================================================================
export const startTimer = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = userIdOf(req);
    if (!userId) {
      res.status(401).json({ message: 'Not authorized' });
      return;
    }
    const task = await loadTask(req, '_id');
    if (!task) {
      res.status(404).json({ message: 'Task not found' });
      return;
    }
    const workspaceId = workspaceOf(req)._id as Id;

    const current = await TimeEntry.findOne({ workspace: workspaceId, user: userId, running: { $eq: true } });
    if (current && String(current.task) === String(task._id)) {
      res.status(200).json({ entry: publicEntry(current), stopped: null });
      return;
    }

    let stopped: ITimeEntry | null = null;
    if (current) {
      stopped = await stopEntry(current, new Date());
      if (stopped) {
        await syncLogged(stopped.task);
        await logActivity(req, 'time.logged', stopped.task, stopped.minutes);
      }
    }

    const entry = await TimeEntry.create({
      workspace: workspaceId,
      task: task._id,
      user: userId,
      startedAt: new Date(),
      endedAt: null,
      minutes: 0,
      running: true,
    });
    res.status(201).json({ entry: publicEntry(entry), stopped: stopped ? publicEntry(stopped) : null });
  } catch (error) {
    handleError(res, error, 'startTimer');
  }
};

// ================================================================
// @desc    Stop the caller's timer on this task and log the time
// @route   POST /api/workspaces/:slug/tasks/:id/timer/stop   (tasks:write)
// ================================================================
export const stopTimer = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = userIdOf(req);
    const taskId = castId(req.params.id);
    if (!userId) {
      res.status(401).json({ message: 'Not authorized' });
      return;
    }
    if (!taskId) {
      res.status(404).json({ message: 'Task not found' });
      return;
    }
    const current = await TimeEntry.findOne({
      workspace: workspaceOf(req)._id, task: taskId, user: userId, running: { $eq: true },
    });
    if (!current) {
      res.status(404).json({ message: 'No timer is running on this task' });
      return;
    }
    const stopped = await stopEntry(current, new Date());
    if (!stopped) {
      res.status(404).json({ message: 'No timer is running on this task' });
      return;
    }
    const loggedMinutes = await syncLogged(taskId);
    await logActivity(req, 'time.logged', taskId, stopped.minutes);
    res.status(200).json({ entry: publicEntry(stopped), loggedMinutes });
  } catch (error) {
    handleError(res, error, 'stopTimer');
  }
};

// ================================================================
// @desc    Delete a time entry (its author, or a role with settings:manage)
// @route   DELETE /api/workspaces/:slug/tasks/:id/time/:entryId   (tasks:write)
// ================================================================
export const deleteTimeEntry = async (req: Request, res: Response): Promise<void> => {
  try {
    const taskId = castId(req.params.id);
    const entryId = castId(req.params.entryId);
    if (!taskId || !entryId) {
      res.status(404).json({ message: 'Time entry not found' });
      return;
    }
    const entry = await TimeEntry.findOne({ _id: entryId, task: taskId, workspace: workspaceOf(req)._id });
    if (!entry) {
      res.status(404).json({ message: 'Time entry not found' });
      return;
    }
    if (String(entry.user) !== String(req.user?._id) && !hasPermission(req, 'settings:manage')) {
      res.status(403).json({ message: 'You can only delete your own time entries' });
      return;
    }
    await TimeEntry.deleteOne({ _id: entry._id });
    const loggedMinutes = await syncLogged(taskId);
    await logActivity(req, 'time.deleted', taskId, entry.minutes);
    res.status(200).json({ message: 'Time entry deleted', id: String(entry._id), loggedMinutes });
  } catch (error) {
    handleError(res, error, 'deleteTimeEntry');
  }
};

// ================================================================
// Timesheet
// ================================================================
interface SheetEntry {
  _id: Id;
  user: PopulatedUser | null;
  task: PopulatedTask | null;
  startedAt: Date;
  endedAt: Date | null;
  minutes: number;
  note?: string;
}

/** Why the query is invalid (message), or the Mongo filter for the caller's timesheet. */
const timesheetFilter = async (req: Request): Promise<{ filter: Record<string, unknown> } | { problem: string }> => {
  const workspaceId = workspaceOf(req)._id as Id;
  const filter: Record<string, unknown> = { workspace: workspaceId, running: { $ne: true } };

  const range: Record<string, Date> = {};
  if (req.query.from !== undefined) {
    const from = parseRangeBound(req.query.from, 'from');
    if (!from) return { problem: 'Invalid "from" date' };
    range.$gte = from;
  }
  if (req.query.to !== undefined) {
    const to = parseRangeBound(req.query.to, 'to');
    if (!to) return { problem: 'Invalid "to" date' };
    range.$lte = to;
  }
  if (Object.keys(range).length > 0) filter.startedAt = range;

  // Only a manager sees other people's time
  if (hasPermission(req, 'settings:manage')) {
    if (req.query.user !== undefined) {
      const user = castId(req.query.user);
      if (!user) return { problem: 'Invalid user' };
      filter.user = user;
    }
  } else {
    const me = userIdOf(req);
    if (!me) return { problem: 'Not authorized' };
    filter.user = me;
  }

  if (req.query.project !== undefined) {
    if (typeof req.query.project !== 'string') return { problem: 'Invalid project' };
    const tasks = await Task.find({ workspace: workspaceId, project: { $eq: req.query.project } }).select('_id').lean();
    filter.task = { $in: tasks.map(task => task._id) };
  }
  return { filter };
};

const loadSheet = async (req: Request, limit: number) => {
  const built = await timesheetFilter(req);
  if ('problem' in built) return built;
  const rows = await TimeEntry.find(built.filter)
    .sort({ startedAt: -1, _id: -1 })
    .limit(limit + 1)
    .populate('user', PUBLIC_USER_FIELDS)
    .populate('task', 'title number project')
    .select('-__v -workspace -running')
    .lean() as unknown as SheetEntry[];
  const truncated = rows.length > limit;
  const entries = rows.slice(0, limit).filter(row => row.task && row.user);
  const keys = await projectKeysFor(workspaceOf(req)._id as Id, entries.map(entry => entry.task as PopulatedTask));
  return { entries, truncated, keys };
};

// ================================================================
// @desc    Timesheet: entries with totals per user, day and task
// @route   GET /api/workspaces/:slug/time?from&to&user&project   (tasks:read)
// ================================================================
export const getTimesheet = async (req: Request, res: Response): Promise<void> => {
  try {
    const sheet = await loadSheet(req, TIMESHEET_LIMIT);
    if ('problem' in sheet) {
      res.status(400).json({ message: sheet.problem });
      return;
    }
    const { entries, truncated, keys } = sheet;
    const totals = summarizeEntries(entries.map(entry => ({
      userId: String((entry.user as PopulatedUser)._id),
      taskId: String((entry.task as PopulatedTask)._id),
      startedAt: entry.startedAt,
      minutes: entry.minutes,
    })));
    const userNames = new Map(entries.map(entry => [String((entry.user as PopulatedUser)._id), (entry.user as PopulatedUser).name ?? '']));
    const tasks = new Map(entries.map(entry => [String((entry.task as PopulatedTask)._id), entry.task as PopulatedTask]));

    res.status(200).json({
      entries: entries.map(entry => ({
        ...entry,
        task: { ...(entry.task as PopulatedTask), key: taskKeyOf(entry.task as PopulatedTask, keys) },
      })),
      totals: {
        minutes: totals.minutes,
        byUser: totals.byUser.map(item => ({ ...item, name: userNames.get(item.user) ?? '' })),
        byDay: totals.byDay,
        byTask: totals.byTask.map(item => {
          const task = tasks.get(item.task);
          return { ...item, title: task?.title ?? '', key: task ? taskKeyOf(task, keys) : '' };
        }),
      },
      truncated,
    });
  } catch (error) {
    handleError(res, error, 'getTimesheet');
  }
};

// ================================================================
// @desc    The caller's running timer in this workspace (entry is null when none)
// @route   GET /api/workspaces/:slug/time/running   (tasks:read)
// ================================================================
export const getRunningTimer = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = userIdOf(req);
    if (!userId) {
      res.status(401).json({ message: 'Not authorized' });
      return;
    }
    const entry = await TimeEntry.findOne({ workspace: workspaceOf(req)._id, user: userId, running: { $eq: true } })
      .populate('task', 'title number project')
      .select('-__v -workspace')
      .lean() as unknown as (SheetEntry & { task: PopulatedTask | null }) | null;
    if (!entry || !entry.task) {
      res.status(200).json({ entry: null });
      return;
    }
    const keys = await projectKeysFor(workspaceOf(req)._id as Id, [entry.task]);
    res.status(200).json({
      entry: { ...entry, running: true, task: { ...entry.task, key: taskKeyOf(entry.task, keys) } },
    });
  } catch (error) {
    handleError(res, error, 'getRunningTimer');
  }
};

// ================================================================
// @desc    Timesheet as CSV (same filters as the timesheet)
// @route   GET /api/workspaces/:slug/time/export.csv?from&to&user&project   (tasks:read)
// ================================================================
export const exportTimesheet = async (req: Request, res: Response): Promise<void> => {
  try {
    const sheet = await loadSheet(req, EXPORT_LIMIT);
    if ('problem' in sheet) {
      res.status(400).json({ message: sheet.problem });
      return;
    }
    const header = ['Date', 'User', 'Task key', 'Task', 'Project', 'Started', 'Ended', 'Minutes', 'Hours', 'Note'];
    const rows = sheet.entries.map(entry => {
      const task = entry.task as PopulatedTask;
      return [
        dayKey(entry.startedAt),
        (entry.user as PopulatedUser).name ?? '',
        taskKeyOf(task, sheet.keys),
        task.title,
        task.project ?? '',
        entry.startedAt.toISOString(),
        entry.endedAt ? entry.endedAt.toISOString() : '',
        entry.minutes,
        (entry.minutes / 60).toFixed(2),
        entry.note ?? '',
      ];
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="timesheet-${workspaceOf(req).slug}-${dayKey(new Date())}.csv"`);
    res.status(200).send(`﻿${toCsvRows([header, ...rows])}`);
  } catch (error) {
    handleError(res, error, 'exportTimesheet');
  }
};
