import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Project from '../models/projectModel.js';
import StatusTransition from '../models/statusTransitionModel.js';
import Task, { TASK_STATUSES, type TaskStatus } from '../models/taskModel.js';
import User from '../models/userModel.js';
import { DAY_MS, MAX_FLOW_RANGE_DAYS, buildFlowReport, dayKey, makeRange, parseDayKey, type FlowStatus, type FlowTask, type FlowTransition } from '../utils/flow/metrics.js';
import { PUBLIC_USER_FIELDS, handleError, workspaceOf } from './taskController.js';

const DEFAULT_RANGE_DAYS = 30;
const MAX_PROJECT_NAME = 60;

class BadQuery extends Error {}

/** A single string query parameter; arrays and nested objects (`?from[]=`) are rejected. */
const queryString = (value: unknown, name: string): string | undefined => {
  if (value === undefined || value === '') return undefined;
  if (typeof value !== 'string') throw new BadQuery(`Invalid ${name}`);
  return value;
};

/** Reads and checks the filters: project name, sprint id and a day range (default: the last 30 days, at most 180). */
const parseFlowQuery = (query: Request['query'], now = Date.now()) => {
  const project = queryString(query.project, 'project');
  if (project !== undefined && project.length > MAX_PROJECT_NAME) throw new BadQuery('Invalid project');

  const sprintParam = queryString(query.sprint, 'sprint');
  if (sprintParam !== undefined && !/^[a-f0-9]{24}$/i.test(sprintParam)) throw new BadQuery('Invalid sprint');
  const sprint = sprintParam === undefined ? undefined : new mongoose.Types.ObjectId(sprintParam);

  const fromParam = queryString(query.from, 'from');
  const toParam = queryString(query.to, 'to');
  if ((fromParam !== undefined && parseDayKey(fromParam) === null) || (toParam !== undefined && parseDayKey(toParam) === null)) {
    throw new BadQuery('Dates must be real days written as YYYY-MM-DD');
  }
  const to = toParam ?? dayKey(now);
  const from = fromParam ?? dayKey((parseDayKey(to) as number) - (DEFAULT_RANGE_DAYS - 1) * DAY_MS);
  if ((parseDayKey(from) as number) > (parseDayKey(to) as number)) throw new BadQuery('The start date must not be after the end date');
  const range = makeRange(from, to);
  if (range.days > MAX_FLOW_RANGE_DAYS) throw new BadQuery(`The date range can span at most ${MAX_FLOW_RANGE_DAYS} days`);

  return { project, sprint, range };
};

type LeanFlowTask = {
  _id: mongoose.Types.ObjectId;
  number?: number;
  title: string;
  project?: string;
  status: TaskStatus;
  assignees?: mongoose.Types.ObjectId[];
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * @desc    Flow analytics (cumulative flow, cycle and lead time, aging work in progress, throughput)
 * @route   GET /api/workspaces/:slug/reports/flow?project=&sprint=&from=YYYY-MM-DD&to=YYYY-MM-DD
 * @access  Private (projects:read)
 */
export const getFlowReport = async (req: Request, res: Response): Promise<void> => {
  let query: ReturnType<typeof parseFlowQuery>;
  try {
    query = parseFlowQuery(req.query);
  } catch (error) {
    if (error instanceof BadQuery) {
      res.status(400).json({ message: error.message });
      return;
    }
    handleError(res, error, 'getFlowReport');
    return;
  }

  try {
    const workspaceId = workspaceOf(req)._id as mongoose.Types.ObjectId;
    const { project, sprint, range } = query;

    // Top-level work items only: subtasks belong to their parent, epics only group
    const filter: Record<string, unknown> = { workspace: workspaceId, parent: null, type: { $ne: 'epic' } };
    if (project !== undefined) filter.project = { $eq: project };
    if (sprint) filter.sprint = sprint;
    const rows = await Task.find(filter)
      .select('number title project status assignees completedAt createdAt updatedAt')
      .lean<LeanFlowTask[]>();

    const projects = await Project.find({ workspace: workspaceId }).select('name key').lean();
    const keyOf = new Map(projects.map(item => [item.name.trim().toLowerCase(), item.key]));
    const tasks: FlowTask[] = rows.map(row => ({
      id: String(row._id),
      key: row.number === undefined ? '' : `${keyOf.get((row.project ?? '').trim().toLowerCase()) ?? 'TM'}-${row.number}`,
      title: row.title,
      project: row.project ?? '',
      status: row.status as FlowStatus,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      completedAt: row.completedAt ?? null,
      assignees: (row.assignees ?? []).map(String),
    }));

    // Transitions of the tasks in scope up to the end of the range (earlier history decides the starting counts)
    const transitionFilter: Record<string, unknown> = { workspace: workspaceId, at: { $lte: new Date(range.end) } };
    if (project !== undefined || sprint) transitionFilter.task = { $in: rows.map(row => row._id) };
    const recorded = await StatusTransition.find(transitionFilter).select('task from to at').sort({ at: 1, _id: 1 }).lean();
    const transitions: FlowTransition[] = recorded.map(item => ({
      task: String(item.task),
      from: (item.from ?? null) as FlowStatus | null,
      to: item.to as FlowStatus,
      at: item.at,
    }));

    const report = buildFlowReport(transitions, tasks, range);

    // Assignee profiles for the aging list only
    const assigneeIds = [...new Set(report.aging.flatMap(item => item.assignees))].map(id => new mongoose.Types.ObjectId(id));
    const users = assigneeIds.length === 0 ? [] : await User.find({ _id: { $in: assigneeIds } }).select(PUBLIC_USER_FIELDS).lean();
    const profiles = new Map(users.map(user => [String(user._id), { _id: String(user._id), name: user.name, avatarUrl: user.avatarUrl }]));

    res.status(200).json({
      range: { from: range.from, to: range.to, days: range.days },
      statuses: TASK_STATUSES,
      cfd: report.cfd,
      cycleTime: report.cycleTime,
      leadTime: report.leadTime,
      aging: report.aging.map(item => ({
        ...item,
        assignees: item.assignees.flatMap(id => profiles.get(id) ?? []),
      })),
      throughput: report.throughput,
    });
  } catch (error) {
    handleError(res, error, 'getFlowReport');
  }
};
