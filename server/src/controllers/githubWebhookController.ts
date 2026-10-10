import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Activity from '../models/activityModel.js';
import Project from '../models/projectModel.js';
import Task, { ITaskLink, MAX_TASK_LINKS } from '../models/taskModel.js';
import Workspace from '../models/workspaceModel.js';
import {
  GithubTransition, LinkInput, PlanItem, TaskKeyRef, TRANSITIONS, planGithubEvent, verifySignature,
} from '../utils/githubEvents.js';

const DEFAULT_KEY_PREFIX = 'TM';
const SLUG_PATTERN = /^[a-z0-9-]{1,80}$/;
// Used to spend the same HMAC time for workspaces that do not exist
const DECOY_SECRET = 'decoy-secret-for-constant-time-lookups';

type Id = mongoose.Types.ObjectId;

/** Adds the link to the task, or refreshes it when the url is already there. Atomic, so concurrent deliveries never duplicate it. */
export const upsertTaskLink = async (workspaceId: Id, taskId: Id, input: LinkInput): Promise<void> => {
  const link: ITaskLink = { ...input, updatedAt: new Date() };
  const fields: Record<string, unknown> = { ...link };
  delete fields.url;
  for (const key of Object.keys(fields)) if (fields[key] === undefined) delete fields[key];

  const set = Object.fromEntries(Object.entries(fields).map(([key, value]) => [`links.$.${key}`, value]));
  // A merged pull request is final: a late or replayed "open" delivery must not move it back
  const target: Record<string, unknown> = { url: link.url };
  if (link.state !== 'merged') target.state = { $ne: 'merged' };

  const refreshed = await Task.updateOne(
    { _id: taskId, workspace: workspaceId, links: { $elemMatch: target } },
    { $set: set },
  );
  if (refreshed.matchedCount > 0) return;

  await Task.updateOne(
    {
      _id: taskId,
      workspace: workspaceId,
      'links.url': { $ne: link.url },
      $expr: { $lt: [{ $size: { $ifNull: ['$links', []] } }, MAX_TASK_LINKS] },
    },
    { $push: { links: link } },
  );
};

/** Moves the task along when it is in a status the transition applies to; completed tasks are never reopened. */
const transitionTask = async (workspaceId: Id, taskId: Id, transition: GithubTransition): Promise<void> => {
  const rule = TRANSITIONS[transition];
  const before = await Task.findOneAndUpdate(
    { _id: taskId, workspace: workspaceId, status: { $in: rule.from } },
    { $set: { status: rule.to, ...(rule.to === 'completed' ? { completedAt: new Date() } : {}) } },
    { returnDocument: 'before', projection: { status: 1, title: 1 } },
  ).lean();
  if (!before) return;
  try {
    await Activity.create({
      workspace: workspaceId,
      // No actor: the change came from GitHub, not from a member
      action: 'task.updated',
      summary: `${before.title} (via GitHub)`.slice(0, 200),
      task: taskId,
      changes: [{ field: 'status', from: before.status, to: rule.to }],
    });
  } catch (error) {
    console.error('github webhook activity error:', (error as Error).message);
  }
};

interface TaskRef { _id: Id; number: number; project: string; }

/** Tasks of the workspace named by the keys; "WEB-12" only matches task 12 when its project key is WEB (TM without a project). */
const resolveTasks = async (workspaceId: Id, items: PlanItem[]): Promise<Map<string, TaskRef>> => {
  const numbers = [...new Set(items.flatMap(item => item.keys.map(key => key.number)))];
  const tasks = await Task.find({ workspace: workspaceId, number: { $in: numbers } }).select('number project').lean();
  const projects = await Project.find({ workspace: workspaceId }).select('name key').lean();
  const keyByName = new Map(projects.map(project => [project.name, project.key]));
  const resolved = new Map<string, TaskRef>();
  for (const task of tasks) {
    if (typeof task.number !== 'number') continue;
    const prefix = (task.project && keyByName.get(task.project)) || DEFAULT_KEY_PREFIX;
    resolved.set(`${prefix}-${task.number}`, { _id: task._id as Id, number: task.number, project: task.project });
  }
  return resolved;
};

const keyId = (key: TaskKeyRef) => `${key.prefix}-${key.number}`;

// ================================================================
// @desc    GitHub webhook (pull_request, push, create, ping): links PRs, commits and branches to tasks
// @route   POST /api/integrations/github/:slug
// @desc    Public: authenticated by the HMAC signature of the raw body (see app.ts for the raw parser)
// ================================================================
export const githubWebhook = async (req: Request, res: Response): Promise<void> => {
  try {
    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    const signature = req.get('x-hub-signature-256');
    const slug = typeof req.params.slug === 'string' && SLUG_PATTERN.test(req.params.slug) ? req.params.slug : null;

    const workspace = slug
      ? await Workspace.findOne({ slug, 'integrations.github.enabled': true })
        .select('+integrations.github.secret integrations.github.autoTransition')
      : null;
    const secret = workspace?.integrations?.github?.secret;

    if (!workspace || !secret) {
      // Same answer and about the same work as a real workspace, so slugs cannot be probed
      verifySignature(DECOY_SECRET, raw, signature);
      res.status(404).json({ message: 'Not found' });
      return;
    }
    if (!verifySignature(secret, raw, signature)) {
      res.status(401).json({ message: 'Invalid signature' });
      return;
    }

    let payload: unknown;
    try {
      payload = JSON.parse(raw.toString('utf8'));
    } catch {
      res.status(400).json({ message: 'Invalid JSON' });
      return;
    }

    const event = req.get('x-github-event') ?? '';
    if (event === 'ping') {
      res.status(200).json({ message: 'pong' });
      return;
    }

    const items = planGithubEvent(event, payload);
    if (!items || items.length === 0) {
      res.status(202).json({ message: 'Ignored' });
      return;
    }

    const workspaceId = workspace._id as Id;
    const autoTransition = workspace.integrations?.github?.autoTransition !== false;
    const tasks = await resolveTasks(workspaceId, items);
    let linked = 0;

    for (const item of items) {
      const seen = new Set<string>();
      for (const key of item.keys) {
        const task = tasks.get(keyId(key));
        if (!task || seen.has(String(task._id))) continue;
        seen.add(String(task._id));
        await upsertTaskLink(workspaceId, task._id, item.link);
        linked += 1;
        if (autoTransition && item.transition) {
          await transitionTask(workspaceId, task._id, item.transition);
        }
      }
    }

    res.status(linked > 0 ? 200 : 202).json({ message: linked > 0 ? 'OK' : 'Ignored', linked });
  } catch (error) {
    console.error('githubWebhook error:', (error as Error).message);
    res.status(500).json({ message: 'Server error' });
  }
};
