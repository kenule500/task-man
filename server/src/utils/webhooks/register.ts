// Outbound webhooks: deliver recorded activity to subscribed URLs (owned by the webhooks module)
import { Request } from 'express';
import mongoose from 'mongoose';
import Webhook from '../../models/webhookModel.js';
import Workspace from '../../models/workspaceModel.js';
import Task from '../../models/taskModel.js';
import Project from '../../models/projectModel.js';
import User from '../../models/userModel.js';
import { getConfig } from '../../config/env.js';
import { onActivity, type RecordedActivity } from '../activity.js';
import { deliverToWebhook, newDeliveryId } from './deliver.js';
import { PayloadInput, buildPayload, matchesEvent } from './payload.js';

type Id = mongoose.Types.ObjectId | string;

/** Task fields for the payload; undefined when the task is gone (deleted). */
const describeTask = async (workspaceId: Id, taskId: Id, slug: string): Promise<PayloadInput['task']> => {
  const task = await Task.findOne({ _id: { $eq: String(taskId) }, workspace: workspaceId })
    .select('number title status project')
    .lean();
  const url = `${getConfig().clientUrl}/${encodeURIComponent(slug)}/tasks?task=${encodeURIComponent(String(taskId))}`;
  if (!task) return { id: String(taskId), key: '', title: '', status: '', url };

  const project = task.project
    ? await Project.findOne({ workspace: workspaceId, nameKey: task.project.trim().toLowerCase() }).select('key').lean()
    : null;
  return {
    id: String(taskId),
    key: task.number === undefined ? '' : `${project?.key ?? 'TM'}-${task.number}`,
    title: task.title,
    status: task.status,
    url,
  };
};

/** Builds the JSON body for one recorded activity (shared by every webhook of the workspace). */
export const payloadForActivity = async (entry: RecordedActivity, deliveryId: string): Promise<PayloadInput | null> => {
  const workspace = await Workspace.findById(entry.workspace).select('slug').lean();
  if (!workspace) return null;
  const actor = entry.actor ? await User.findById(entry.actor).select('name').lean() : null;
  return {
    deliveryId,
    event: entry.action,
    createdAt: entry.createdAt,
    workspaceSlug: workspace.slug,
    actor: actor ? { id: String(actor._id), name: actor.name } : null,
    summary: entry.summary,
    task: entry.task ? await describeTask(entry.workspace, entry.task, workspace.slug) : undefined,
    changes: entry.changes,
  };
};

/**
 * Sends one recorded activity to the workspace's matching webhooks. Awaited (in parallel) so a serverless
 * request does not end before the deliveries are done; failures are logged per delivery and never thrown.
 */
export const dispatchActivity = async (_req: Request, entry: RecordedActivity): Promise<void> => {
  const hooks = await Webhook.find({ workspace: entry.workspace, active: true }).select('+secret');
  const targets = hooks.filter(hook => matchesEvent(hook.events, entry.action));
  if (targets.length === 0) return;

  const base = await payloadForActivity(entry, '');
  if (!base) return;

  await Promise.allSettled(targets.map(hook => {
    const deliveryId = newDeliveryId();
    const body = JSON.stringify(buildPayload({ ...base, deliveryId }));
    return deliverToWebhook(hook, { event: entry.action, deliveryId, body });
  }));
};

let registered = false;

/** Subscribes webhook delivery to recorded activity once per process. */
export const registerWebhooks = (): void => {
  if (registered) return;
  registered = true;
  onActivity(dispatchActivity);
};
