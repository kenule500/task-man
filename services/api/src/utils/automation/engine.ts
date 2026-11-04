import { MAX_LABELS } from '../../models/taskModel.js';
import type { IActivityChange } from '../../models/activityModel.js';
import type {
  IAutomationAction,
  IAutomationCondition,
  IAutomationTrigger,
  TriggerType,
} from '../../models/automationModel.js';

// Pure rule matching and planning. Nothing here touches the database.

/** Something that happened to a task, derived from a recorded activity entry. */
export interface AutomationEvent {
  type: TriggerType;
  // status/priority: the new value; labeled: the labels that were added
  values: string[];
}

/** The task fields rules look at. */
export interface RuleTask {
  title: string;
  status: string;
  priority: string;
  type: string;
  labels?: string[];
  assignees?: unknown[];
  sprint?: unknown;
}

const splitList = (value: string | undefined): string[] =>
  (value ?? '').split(',').map(item => item.trim()).filter(Boolean);

/** Triggers raised by one activity entry (a single update can change several fields). */
export const eventsFromActivity = (action: string, changes: IActivityChange[] = []): AutomationEvent[] => {
  if (action === 'task.created') return [{ type: 'task.created', values: [] }];
  if (action === 'task.commented') return [{ type: 'task.commented', values: [] }];
  if (action !== 'task.updated') return [];

  const events: AutomationEvent[] = [];
  for (const change of changes) {
    if (change.field === 'status' && change.to) events.push({ type: 'task.status_changed', values: [change.to] });
    else if (change.field === 'priority' && change.to) events.push({ type: 'task.priority_changed', values: [change.to] });
    else if (change.field === 'labels') {
      const before = new Set(splitList(change.from).map(label => label.toLowerCase()));
      const added = splitList(change.to).filter(label => !before.has(label.toLowerCase()));
      if (added.length > 0) events.push({ type: 'task.labeled', values: added });
    } else if (change.field === 'assignees') {
      // The audit log keeps the number of assignees: the same or a higher count means someone was added
      const from = Number(change.from ?? 0);
      const to = Number(change.to ?? 0);
      if (Number.isFinite(from) && Number.isFinite(to) && to > 0 && to >= from) events.push({ type: 'task.assigned', values: [] });
    }
  }
  return events;
};

export const matchesTrigger = (trigger: Pick<IAutomationTrigger, 'type' | 'to'>, event: AutomationEvent): boolean => {
  if (trigger.type !== event.type) return false;
  if (!trigger.to) return true;
  const wanted = trigger.to.toLowerCase();
  return event.values.some(value => value.toLowerCase() === wanted);
};

const hasLabel = (task: RuleTask, label: string): boolean =>
  (task.labels ?? []).some(item => item.toLowerCase() === label.toLowerCase());

const matchesCondition = (condition: IAutomationCondition, task: RuleTask): boolean => {
  switch (condition.field) {
    case 'type': return (task.type === condition.value) === (condition.op === 'is');
    case 'priority': return (task.priority === condition.value) === (condition.op === 'is');
    case 'status': return (task.status === condition.value) === (condition.op === 'is');
    case 'label': return hasLabel(task, condition.value) === (condition.op === 'has');
    case 'assignee': return ((task.assignees ?? []).length === 0) === (condition.op === 'is_empty');
    case 'sprint': return Boolean(task.sprint) === (condition.op === 'is_set');
    default: return false;
  }
};

/** Every condition must hold; a rule without conditions always matches. */
export const matchesConditions = (conditions: IAutomationCondition[], task: RuleTask): boolean =>
  conditions.every(condition => matchesCondition(condition, task));

export interface PlanContext {
  // The person whose change started the rule
  actorId?: string;
  // Current workspace members (user ids); assignments to anyone else are skipped
  memberIds: string[];
}

/** What a rule does to a task: field changes, new comments and the audit trail for both. */
export interface ActionPlan {
  patch: {
    status?: string;
    priority?: string;
    labels?: string[];
    assignees?: string[];
    sprint?: null;
  };
  comments: string[];
  changes: IActivityChange[];
}

/** Applies the actions in order to a copy of the task; later actions see earlier results. */
export const planActions = (
  rule: { actions: IAutomationAction[] },
  task: RuleTask,
  ctx: PlanContext,
): ActionPlan => {
  let status = task.status;
  let priority = task.priority;
  let labels = [...(task.labels ?? [])];
  let assignees = (task.assignees ?? []).map(String);
  let sprint: unknown = task.sprint ?? null;
  const comments: string[] = [];
  const members = new Set(ctx.memberIds);

  for (const action of rule.actions) {
    switch (action.type) {
      case 'set_status': status = action.value; break;
      case 'set_priority': priority = action.value; break;
      case 'add_label':
        if (action.value && !labels.some(label => label.toLowerCase() === action.value.toLowerCase()) && labels.length < MAX_LABELS) {
          labels = [...labels, action.value];
        }
        break;
      case 'remove_label':
        labels = labels.filter(label => label.toLowerCase() !== action.value.toLowerCase());
        break;
      case 'assign_to':
        if (members.has(action.value) && !assignees.includes(action.value)) assignees = [...assignees, action.value];
        break;
      case 'assign_to_actor':
        if (ctx.actorId && members.has(ctx.actorId) && !assignees.includes(ctx.actorId)) assignees = [...assignees, ctx.actorId];
        break;
      case 'unassign_all': assignees = []; break;
      case 'add_comment':
        // A comment needs an author, so it is skipped when nobody triggered the rule
        if (ctx.actorId && action.value) comments.push(action.value);
        break;
      case 'move_to_backlog': sprint = null; break;
      default: break;
    }
  }

  const patch: ActionPlan['patch'] = {};
  const changes: IActivityChange[] = [];
  if (status !== task.status) {
    patch.status = status;
    changes.push({ field: 'status', from: task.status, to: status });
  }
  if (priority !== task.priority) {
    patch.priority = priority;
    changes.push({ field: 'priority', from: task.priority, to: priority });
  }
  const labelsBefore = (task.labels ?? []).join(', ');
  if (labels.join(', ') !== labelsBefore) {
    patch.labels = labels;
    changes.push({ field: 'labels', from: labelsBefore || undefined, to: labels.join(', ') || undefined });
  }
  const assigneesBefore = (task.assignees ?? []).map(String);
  if (assignees.length !== assigneesBefore.length || assignees.some(id => !assigneesBefore.includes(id))) {
    patch.assignees = assignees;
    // Same shape as the task audit entries: the number of assignees
    changes.push({ field: 'assignees', from: String(assigneesBefore.length), to: String(assignees.length) });
  }
  if (task.sprint && !sprint) {
    patch.sprint = null;
    changes.push({ field: 'sprint', from: String(task.sprint), to: undefined });
  }
  for (const text of comments) changes.push({ field: 'comment', to: text.length > 200 ? `${text.slice(0, 199)}…` : text });

  return { patch, comments, changes };
};
