import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Activity from '../models/activityModel.js';
import Project from '../models/projectModel.js';
import Sprint from '../models/sprintModel.js';
import Task from '../models/taskModel.js';
import { PUBLIC_USER_FIELDS, handleError, workspaceOf } from './taskController.js';

type Membership = { at: number; kind: 'in' | 'out' };

export interface SprintScopeTask {
  _id: string;
  createdAt: Date;
  /** Sprint the task points at now (`null` = backlog or another sprint). */
  inSprintNow: boolean;
  /** Moves into (`in`) and out of (`out`) this sprint recorded in the activity log, oldest first. */
  events: Membership[];
}

export interface SprintScopeResult {
  committed: boolean;
  added: boolean;
  removed: boolean;
  /** Part of the sprint when it ended (or now): committed or added, and not removed. */
  inAtEnd: boolean;
}

/**
 * Where one task stood in a sprint, rebuilt from the task's recorded moves.
 * Without a start time (planned sprint) nothing is "added" and everything in the sprint is committed.
 * A task whose last recorded move was `in` but that points elsewhere now was moved out silently by
 * completing (or deleting) the sprint, so it counts as part of the sprint at its end.
 */
export const classifySprintScope = (task: SprintScopeTask, startedAt?: number): SprintScopeResult => {
  const { events } = task;
  const everIn = task.inSprintNow || events.length > 0;
  if (!everIn) return { committed: false, added: false, removed: false, inAtEnd: false };

  const last = events.at(-1);
  const silentlyMoved = !task.inSprintNow && last?.kind === 'in';
  const inAtEnd = task.inSprintNow || silentlyMoved;

  let inAtStart: boolean;
  if (startedAt === undefined) {
    inAtStart = task.inSprintNow;
  } else {
    const before = events.filter(event => event.at <= startedAt).at(-1);
    if (before) inAtStart = before.kind === 'in';
    else if (events[0]?.kind === 'out') inAtStart = task.createdAt.getTime() <= startedAt;
    else if (events[0]?.kind === 'in') inAtStart = false;
    else inAtStart = task.createdAt.getTime() <= startedAt;
  }

  const added = startedAt !== undefined && !inAtStart;
  return { committed: inAtStart, added, removed: !inAtEnd, inAtEnd };
};

type LeanTask = {
  _id: mongoose.Types.ObjectId;
  number?: number;
  title: string;
  type?: string;
  status: string;
  project?: string;
  storyPoints?: number | null;
  sprint?: mongoose.Types.ObjectId | null;
  assignees?: { _id: mongoose.Types.ObjectId; name?: string; avatarUrl?: string }[];
  completedAt?: Date;
  createdAt: Date;
};

const toItem = (task: LeanTask) => ({
  _id: String(task._id),
  number: task.number,
  title: task.title,
  type: task.type ?? 'task',
  status: task.status,
  project: task.project ?? '',
  storyPoints: task.storyPoints ?? null,
  assignees: (task.assignees ?? []).map(user => ({ _id: String(user._id), name: user.name ?? '', avatarUrl: user.avatarUrl })),
  completedAt: task.completedAt ?? null,
});

type ReportItem = ReturnType<typeof toItem>;

const total = (items: ReportItem[]) => ({
  count: items.length,
  points: items.reduce((sum, item) => sum + (item.storyPoints ?? 0), 0),
});

/**
 * @desc    Sprint report: what was committed, completed, added after the start and removed
 * @route   GET /api/workspaces/:slug/projects/:projectId/sprints/:sprintId/report
 */
export const getSprintReport = async (req: Request, res: Response): Promise<void> => {
  try {
    const workspaceId = workspaceOf(req)._id as mongoose.Types.ObjectId;
    const projectId = String(req.params.projectId);
    const sprintId = String(req.params.sprintId);
    if (!mongoose.isValidObjectId(projectId) || !mongoose.isValidObjectId(sprintId)) {
      res.status(404).json({ message: 'Sprint not found' });
      return;
    }

    const project = await Project.findOne({ _id: new mongoose.Types.ObjectId(projectId), workspace: workspaceId }).lean();
    const sprint = project && await Sprint.findOne({
      _id: new mongoose.Types.ObjectId(sprintId), project: project._id, workspace: workspaceId,
    }).lean();
    if (!project || !sprint) {
      res.status(404).json({ message: 'Sprint not found' });
      return;
    }

    // Every recorded move into or out of this sprint
    const sprintObjectId = String(sprint._id);
    const moves = await Activity.find({
      workspace: workspaceId,
      action: 'task.updated',
      task: { $exists: true },
      changes: { $elemMatch: { field: 'sprint', $or: [{ from: sprintObjectId }, { to: sprintObjectId }] } },
    }).sort({ createdAt: 1, _id: 1 }).select('task changes createdAt').lean();

    const eventsByTask = new Map<string, Membership[]>();
    for (const move of moves) {
      const key = String(move.task);
      const list = eventsByTask.get(key) ?? [];
      for (const change of move.changes) {
        if (change.field !== 'sprint') continue;
        if (change.from === sprintObjectId) list.push({ at: move.createdAt.getTime(), kind: 'out' });
        if (change.to === sprintObjectId) list.push({ at: move.createdAt.getTime(), kind: 'in' });
      }
      eventsByTask.set(key, list);
    }

    const candidateIds = [...eventsByTask.keys()].map(id => new mongoose.Types.ObjectId(id));
    const tasks = await Task.find({
      workspace: workspaceId,
      parent: null,
      type: { $ne: 'epic' },
      $or: [{ sprint: sprint._id }, { _id: { $in: candidateIds } }],
    })
      .populate('assignees', PUBLIC_USER_FIELDS)
      .sort({ number: 1, createdAt: 1 })
      .lean<LeanTask[]>();

    const startedAt = sprint.startedAt?.getTime();
    const endedAt = sprint.status === 'completed' ? sprint.completedAt?.getTime() : undefined;
    const buckets = { committed: [] as ReportItem[], added: [] as ReportItem[], removed: [] as ReportItem[], completed: [] as ReportItem[], notCompleted: [] as ReportItem[] };

    for (const task of tasks) {
      const scope = classifySprintScope({
        _id: String(task._id),
        createdAt: task.createdAt,
        inSprintNow: String(task.sprint ?? '') === sprintObjectId,
        events: eventsByTask.get(String(task._id)) ?? [],
      }, startedAt);
      const item = toItem(task);
      if (scope.committed) buckets.committed.push(item);
      if (scope.added) buckets.added.push(item);
      if (scope.removed) buckets.removed.push(item);
      if (scope.inAtEnd) {
        // Finished after the sprint was closed does not count as delivered by the sprint
        const doneInTime = task.status === 'completed'
          && (endedAt === undefined || !task.completedAt || task.completedAt.getTime() <= endedAt);
        (doneInTime ? buckets.completed : buckets.notCompleted).push(item);
      }
    }

    res.status(200).json({
      sprint: {
        _id: String(sprint._id),
        project: String(project._id),
        projectName: project.name,
        projectKey: project.key,
        name: sprint.name,
        goal: sprint.goal ?? '',
        startDate: sprint.startDate,
        endDate: sprint.endDate,
        status: sprint.status,
        startedAt: sprint.startedAt ?? null,
        completedAt: sprint.completedAt ?? null,
      },
      summary: {
        committed: total(buckets.committed),
        completed: total(buckets.completed),
        notCompleted: total(buckets.notCompleted),
        added: total(buckets.added),
        removed: total(buckets.removed),
      },
      ...buckets,
    });
  } catch (error) {
    handleError(res, error, 'getSprintReport');
  }
};
