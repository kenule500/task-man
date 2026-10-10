import { Request } from 'express';
import mongoose from 'mongoose';
import Automation from '../../models/automationModel.js';
import Task from '../../models/taskModel.js';
import Workspace from '../../models/workspaceModel.js';
import { onActivity, recordActivity, type RecordedActivity } from '../activity.js';
import { eventsFromActivity, matchesConditions, matchesTrigger, planActions, type ActionPlan, type RuleTask } from './engine.js';

// Rules can start other rules (a rule changes a status, another one reacts to it); this keeps that finite
export const MAX_AUTOMATION_DEPTH = 3;

interface RunState {
  depth: number;
  // "<rule id>:<task id>" pairs that already ran during this request
  fired: Set<string>;
}

const states = new WeakMap<Request, RunState>();
const stateOf = (req: Request): RunState => {
  let state = states.get(req);
  if (!state) {
    state = { depth: 0, fired: new Set() };
    states.set(req, state);
  }
  return state;
};

interface RuleTaskDoc extends RuleTask {
  _id: mongoose.Types.ObjectId;
  project?: string;
}

const memberIdsOf = async (req: Request, workspaceId: mongoose.Types.ObjectId): Promise<string[]> => {
  const loaded = (req.workspace as { members?: { user: unknown }[] } | undefined)?.members;
  if (loaded) return loaded.map(member => String(member.user));
  const workspace = await Workspace.findById(workspaceId).select('members.user').lean();
  return (workspace?.members ?? []).map(member => String(member.user));
};

/** The database changes for a plan. updateOne skips the model hooks, so completedAt is kept in sync here. */
const buildUpdate = (plan: ActionPlan, actorId: string | undefined) => {
  const $set: Record<string, unknown> = {};
  const $unset: Record<string, ''> = {};
  const { patch } = plan;
  if (patch.status !== undefined) {
    $set.status = patch.status;
    if (patch.status === 'completed') $set.completedAt = new Date();
    else $unset.completedAt = '';
  }
  if (patch.priority !== undefined) $set.priority = patch.priority;
  if (patch.labels !== undefined) $set.labels = patch.labels;
  if (patch.assignees !== undefined) $set.assignees = patch.assignees.map(id => new mongoose.Types.ObjectId(id));
  if (patch.sprint === null) $set.sprint = null;

  const update: Record<string, unknown> = {};
  if (Object.keys($set).length > 0) update.$set = $set;
  if (Object.keys($unset).length > 0) update.$unset = $unset;
  if (plan.comments.length > 0 && actorId) {
    update.$push = {
      comments: {
        $each: plan.comments.map(text => ({
          _id: new mongoose.Types.ObjectId(),
          author: new mongoose.Types.ObjectId(actorId),
          text,
          mentions: [],
          createdAt: new Date(),
        })),
      },
    };
  }
  return update;
};

const runRules = async (req: Request, entry: RecordedActivity, state: RunState): Promise<void> => {
  const events = eventsFromActivity(entry.action, entry.changes ?? []);
  if (events.length === 0 || !entry.task || !mongoose.isValidObjectId(String(entry.task))) return;

  const workspaceId = new mongoose.Types.ObjectId(String(entry.workspace));
  const taskId = new mongoose.Types.ObjectId(String(entry.task));
  const rules = await Automation.find({ workspace: workspaceId, enabled: true }).sort({ createdAt: 1 }).lean();
  if (rules.length === 0) return;

  let memberIds: string[] | undefined;
  for (const rule of rules) {
    const key = `${rule._id}:${taskId}`;
    if (state.fired.has(key)) continue;
    if (!events.some(event => matchesTrigger(rule.trigger, event))) continue;

    try {
      // Re-read the task for every rule: an earlier rule (or a chained one) may have changed it
      const task = await Task.findOne({ _id: taskId, workspace: workspaceId })
        .select('title status priority type labels assignees sprint project')
        .lean<RuleTaskDoc>();
      if (!task || task.type === 'epic') return;
      if (rule.project && rule.project !== task.project) continue;
      if (!matchesConditions(rule.conditions, task)) continue;

      state.fired.add(key);
      const actorId = entry.actor ? String(entry.actor) : undefined;
      memberIds ??= await memberIdsOf(req, workspaceId);
      const plan = planActions(rule, task, { actorId, memberIds });
      if (plan.changes.length === 0) continue;

      await Task.updateOne({ _id: taskId, workspace: workspaceId }, buildUpdate(plan, actorId));
      if (plan.patch.sprint === null) {
        await Task.updateMany({ workspace: workspaceId, parent: taskId }, { $set: { sprint: null } });
      }
      await Automation.updateOne(
        { _id: rule._id, workspace: workspaceId },
        { $inc: { runCount: 1 }, $set: { lastRunAt: new Date() } },
      );
      await recordActivity(req, {
        action: 'automation.ran', summary: rule.name, task: taskId,
        changes: [{ field: 'task', to: task.title }],
      });
      // Recorded like any edit, so the change is audited and can start other rules
      await recordActivity(req, {
        action: 'task.updated', summary: `${task.title} · automation "${rule.name}"`, task: taskId,
        changes: plan.changes.filter(change => change.field !== 'comment'),
      });
    } catch (error) {
      console.error('automation rule error:', (error as Error).message);
    }
  }
};

const handleActivity = async (req: Request, entry: RecordedActivity): Promise<void> => {
  if (!entry.task || !['task.created', 'task.updated', 'task.commented'].includes(entry.action)) return;
  const state = stateOf(req);
  if (state.depth >= MAX_AUTOMATION_DEPTH) return;
  state.depth += 1;
  try {
    await runRules(req, entry, state);
  } catch (error) {
    console.error('automation error:', (error as Error).message);
  } finally {
    state.depth -= 1;
  }
};

let registered = false;

/** Subscribes the automation engine to recorded activity once per process. */
export const registerAutomations = (): void => {
  if (registered) return;
  registered = true;
  onActivity(handleActivity);
};
