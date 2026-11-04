import { Request } from 'express';
import mongoose from 'mongoose';
import Task from '../models/taskModel.js';
import Notification, { MAX_NOTIFICATION_SUMMARY, NotificationType } from '../models/notificationModel.js';
import User from '../models/userModel.js';
import { notificationTemplate } from './emailTemplates.js';
import { getClientUrl } from './requestHelpers.js';
import { sendEmail } from './sendEmail.js';
import { isPushConfigured, pushSentence, sendPushToUser } from './webPush.js';

type Id = mongoose.Types.ObjectId | string;

export interface NotifiableTask {
  _id: Id;
  title: string;
  status?: string;
  owner?: Id | null;
  assignees?: Id[] | null;
  // Followers; they hear about comments and completion like the assignees
  watchers?: Id[] | null;
}

export interface TaskSnapshot {
  assignees?: Id[] | null;
  status?: string;
}

interface WorkspaceLike {
  _id: Id;
  slug: string;
  name: string;
  members: { user: Id }[];
}

export interface PlannedNotification {
  type: NotificationType;
  userIds: string[];
}

const idOf = (value: Id | null | undefined): string => String(value ?? '');
const unique = (ids: string[]): string[] => [...new Set(ids.filter(Boolean))];

// ----------------------------------------------------------------
// Pure rules (unit tested)
// ----------------------------------------------------------------

/** Assignees present in `next` but not in `previous`. */
export const addedAssignees = (previous: Id[] | null | undefined, next: Id[] | null | undefined): string[] => {
  const before = new Set((previous ?? []).map(idOf));
  return unique((next ?? []).map(idOf)).filter(id => !before.has(id));
};

/** Who is told about a created or updated task. `previous` is the task before the update (absent on create). */
export const planTaskNotifications = (
  actorId: Id,
  task: NotifiableTask,
  previous?: TaskSnapshot,
): PlannedNotification[] => {
  const actor = idOf(actorId);
  const plans: PlannedNotification[] = [];

  const assigned = addedAssignees(previous?.assignees, task.assignees).filter(id => id !== actor);
  if (assigned.length > 0) plans.push({ type: 'task.assigned', userIds: assigned });

  // Only the transition counts: creating an already completed task, or saving it again, stays quiet
  if (previous && previous.status !== 'completed' && task.status === 'completed') {
    const audience = unique([idOf(task.owner), ...(task.assignees ?? []).map(idOf), ...(task.watchers ?? []).map(idOf)])
      .filter(id => id !== actor);
    if (audience.length > 0) plans.push({ type: 'task.completed', userIds: audience });
  }
  return plans;
};

/** Who is told about a new comment: mentioned members, then the task's owner, assignees and watchers (once each). */
export const planCommentNotifications = (
  authorId: Id,
  task: NotifiableTask,
  mentionedIds: Id[],
): PlannedNotification[] => {
  const author = idOf(authorId);
  const mentioned = unique(mentionedIds.map(idOf)).filter(id => id !== author);
  const taken = new Set(mentioned);
  const repliers = unique([idOf(task.owner), ...(task.assignees ?? []).map(idOf), ...(task.watchers ?? []).map(idOf)])
    .filter(id => id !== author && !taken.has(id));

  const plans: PlannedNotification[] = [];
  if (mentioned.length > 0) plans.push({ type: 'comment.mention', userIds: mentioned });
  if (repliers.length > 0) plans.push({ type: 'comment.reply_on_my_task', userIds: repliers });
  return plans;
};

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Members tagged in a comment. Accepts "@First Last" (full name) and "@first" (first name, only when
 * no other member shares it). Matching ignores case and needs the name to end at a word boundary, so
 * "@Dan" does not match "@Daniel". Longer names are consumed first: "@Ann Lee" never also tags "Ann".
 */
export const resolveMentions = (text: string, members: { id: string; name: string }[]): string[] => {
  if (!text.includes('@')) return [];

  const firstNameOf = (name: string) => name.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
  const firstNameCount = new Map<string, number>();
  for (const member of members) {
    const first = firstNameOf(member.name);
    firstNameCount.set(first, (firstNameCount.get(first) ?? 0) + 1);
  }

  const candidates = members.flatMap(member => {
    const full = member.name.trim().replace(/\s+/g, ' ');
    const first = full.split(' ')[0] ?? '';
    const list = [{ id: member.id, label: full }];
    if (first && first.toLowerCase() !== full.toLowerCase() && firstNameCount.get(first.toLowerCase()) === 1) {
      list.push({ id: member.id, label: first });
    }
    return list;
  }).filter(candidate => candidate.label).sort((a, b) => b.label.length - a.label.length);

  let remaining = text;
  const found = new Set<string>();
  for (const { id, label } of candidates) {
    const pattern = new RegExp(
      `(^|[^\\p{L}\\p{N}_@])@${escapeRegExp(label).replace(/ /g, '\\s+')}(?![\\p{L}\\p{N}_])`,
      'giu',
    );
    remaining = remaining.replace(pattern, (match, lead: string) => {
      found.add(id);
      return lead + ' '.repeat(match.length - lead.length);
    });
  }
  return [...found];
};

/** Whether the recipient's preferences allow an email for this notification (in-app is always on). */
export const wantsEmail = (
  prefs: { email?: boolean; taskAssigned?: boolean; taskCompleted?: boolean } | null | undefined,
  type: NotificationType,
): boolean => {
  if (!prefs?.email) return false;
  return type === 'task.completed' ? Boolean(prefs.taskCompleted) : Boolean(prefs.taskAssigned);
};

/** Whether the recipient wants device (Web Push) notifications; on unless they switched it off. */
export const wantsPush = (prefs: { push?: boolean } | null | undefined): boolean => prefs?.push !== false;

// ----------------------------------------------------------------
// Delivery (never throws)
// ----------------------------------------------------------------
interface Delivery {
  workspace: WorkspaceLike;
  actor: { _id: Id; name: string };
  task: NotifiableTask;
  excerpt?: string;
}

const deliver = async (delivery: Delivery, plans: PlannedNotification[]): Promise<void> => {
  const { workspace, actor, task, excerpt } = delivery;
  const memberIds = new Set(workspace.members.map(member => idOf(member.user)));
  // Whoever left the workspace hears nothing about it
  const rows = plans.flatMap(plan => unique(plan.userIds)
    .filter(id => memberIds.has(id) && mongoose.isValidObjectId(id))
    .map(user => ({ user, type: plan.type })));
  if (rows.length === 0) return;

  let created: { _id?: Id }[] = [];
  let stored = false;
  try {
    created = await Notification.insertMany(rows.map(row => ({
      user: row.user,
      workspace: workspace._id,
      actor: actor._id,
      type: row.type,
      task: task._id,
      summary: task.title.slice(0, MAX_NOTIFICATION_SUMMARY),
    })));
    stored = true;
  } catch (error) {
    console.error('notify insert error:', (error as Error).message);
  }

  try {
    const recipients = await User.find({ _id: { $in: unique(rows.map(row => row.user)) } }).select('email notifications');
    const byId = new Map(recipients.map(user => [idOf(user._id as Id), user]));
    const link = `${getClientUrl()}/${workspace.slug}/tasks?task=${idOf(task._id)}`;

    await Promise.allSettled(rows.map(async (row, index) => {
      const recipient = byId.get(row.user);
      if (stored && recipient && isPushConfigured() && wantsPush(recipient.notifications)) {
        const notificationId = created[index]?._id;
        // Awaited (serverless hosts freeze after the response); sendPushToUser never throws
        await sendPushToUser(row.user, {
          title: 'TaskMan',
          body: pushSentence(row.type, actor.name, task.title),
          url: `/${workspace.slug}/tasks?task=${idOf(task._id)}`,
          tag: notificationId ? idOf(notificationId) : `${row.type}:${idOf(task._id)}`,
        });
      }
      if (!recipient?.email || !wantsEmail(recipient.notifications, row.type)) return;
      const withExcerpt = row.type === 'comment.mention' || row.type === 'comment.reply_on_my_task';
      try {
        await sendEmail({
          to: recipient.email,
          ...notificationTemplate(row.type, actor.name, task.title, workspace.name, link, withExcerpt ? excerpt : undefined),
        });
      } catch (error) {
        // e.g. production without an email provider: the in-app notification is already stored
        console.error('notify email error:', (error as Error).message);
      }
    }));
  } catch (error) {
    console.error('notify email error:', (error as Error).message);
  }
};

/** Request context (workspace + signed-in user) or null when a handler runs without it. */
const contextOf = (req: Request): { workspace: WorkspaceLike; actor: { _id: Id; name: string } } | null => {
  const workspace = req.workspace as unknown as WorkspaceLike | undefined;
  const user = req.user;
  if (!workspace || !user) return null;
  return { workspace, actor: { _id: user._id as Id, name: user.name } };
};

/**
 * Call after a task is created (no `previous`) or saved. Notifies new assignees and, when the status
 * just became completed, the owner and assignees. The actor never hears about their own change.
 */
export const notifyTaskEvents = async (req: Request, task: NotifiableTask, previous?: TaskSnapshot): Promise<void> => {
  try {
    const context = contextOf(req);
    if (!context) return;
    const plans = planTaskNotifications(context.actor._id, task, previous);
    if (plans.length > 0) await deliver({ ...context, task }, plans);
  } catch (error) {
    console.error('notifyTaskEvents error:', (error as Error).message);
  }
};

/**
 * Call after a comment is saved. Notifies the mentioned members and the task's other people (owner,
 * assignees, watchers) and makes the commenter a watcher. `mentions` are the ids already resolved with
 * `resolveMentions`; watchers are read from the task when the caller did not load them.
 */
export const notifyComment = async (
  req: Request,
  task: NotifiableTask,
  comment: { text: string; mentions: Id[] },
): Promise<void> => {
  try {
    const context = contextOf(req);
    if (!context) return;
    const taskId = new mongoose.Types.ObjectId(idOf(task._id));
    const watchers = task.watchers ?? (await Task.findById(taskId).select('watchers').lean())?.watchers ?? [];
    const plans = planCommentNotifications(context.actor._id, { ...task, watchers }, comment.mentions);
    // Commenting subscribes the author to the conversation
    await Task.updateOne({ _id: taskId }, { $addToSet: { watchers: new mongoose.Types.ObjectId(idOf(context.actor._id)) } });
    if (plans.length > 0) await deliver({ ...context, task, excerpt: comment.text }, plans);
  } catch (error) {
    console.error('notifyComment error:', (error as Error).message);
  }
};

/** Workspace members as `{ id, name }`, for resolving @mentions in a comment. */
export const loadMentionCandidates = async (
  workspace: { members: { user: Id }[] },
): Promise<{ id: string; name: string }[]> => {
  const users = await User.find({ _id: { $in: workspace.members.map(member => member.user) } }).select('name');
  return users.map(user => ({ id: idOf(user._id as Id), name: user.name }));
};
