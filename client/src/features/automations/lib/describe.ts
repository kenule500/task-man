import type {
  AutomationAction, AutomationCondition, AutomationTrigger, TriggerType,
} from '../types';
import { PRIORITY_LABELS, STATUS_LABELS, TYPE_LABELS } from './options';

/** Subset of a rule the sentence needs (works for saved rules, templates and drafts). */
export interface DescribableRule {
  trigger: Partial<AutomationTrigger> & { type: TriggerType };
  conditions: AutomationCondition[];
  actions: AutomationAction[];
}

export interface DescribeContext {
  /** Name of a member by id; unknown ids read as "a member". */
  memberName?: (id: string) => string | undefined;
}

const quote = (text: string) => `"${text}"`;
const lower = (text: string | undefined) => (text ?? '').toLowerCase();
const article = (word: string) => (/^[aeiou]/i.test(word) ? 'an' : 'a');
const truncate = (text: string, max = 60) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

const joinList = (parts: string[], last = 'and'): string =>
  parts.length <= 1 ? (parts[0] ?? '') : `${parts.slice(0, -1).join(', ')} ${last} ${parts[parts.length - 1]}`;

export const describeTrigger = (trigger: DescribableRule['trigger']): string => {
  const to = trigger.to ?? '';
  switch (trigger.type) {
    case 'task.created': return 'a task is created';
    case 'task.status_changed': return to ? `a task moves to ${STATUS_LABELS[to] ?? to}` : 'a task changes status';
    case 'task.assigned': return 'someone is assigned to a task';
    case 'task.priority_changed': return to ? `a task's priority changes to ${lower(PRIORITY_LABELS[to] ?? to)}` : "a task's priority changes";
    case 'task.commented': return 'a comment is added to a task';
    case 'task.labeled': return to ? `the label ${quote(to)} is added to a task` : 'a label is added to a task';
    default: return 'something happens';
  }
};

export const describeCondition = (condition: AutomationCondition): string => {
  const { field, op, value } = condition;
  switch (field) {
    case 'type': {
      const word = lower(TYPE_LABELS[value] ?? value);
      return op === 'is' ? `it is ${article(word)} ${word}` : `it is not ${article(word)} ${word}`;
    }
    case 'priority': return `its priority is ${op === 'is' ? '' : 'not '}${lower(PRIORITY_LABELS[value] ?? value)}`;
    case 'status': return `its status is ${op === 'is' ? '' : 'not '}${STATUS_LABELS[value] ?? value}`;
    case 'label': return op === 'has' ? `it has the label ${quote(value)}` : `it does not have the label ${quote(value)}`;
    case 'assignee': return op === 'is_empty' ? 'it has no assignee' : 'it has an assignee';
    case 'sprint': return op === 'is_set' ? 'it is in a sprint' : 'it is not in a sprint';
    default: return 'it matches';
  }
};

/** Who "the person who triggered the rule" is, in the words of the trigger. */
const actorPhrase = (type: TriggerType): string => {
  switch (type) {
    case 'task.created': return 'the person who created it';
    case 'task.status_changed': return 'the person who moved it';
    case 'task.priority_changed': return 'the person who changed its priority';
    case 'task.commented': return 'the person who commented';
    case 'task.labeled': return 'the person who added the label';
    default: return 'the person who made the change';
  }
};

export const describeAction = (action: AutomationAction, trigger: DescribableRule['trigger'], context: DescribeContext = {}): string => {
  const { type, value } = action;
  switch (type) {
    case 'set_status': return `set its status to ${STATUS_LABELS[value] ?? value}`;
    case 'set_priority': return `set its priority to ${lower(PRIORITY_LABELS[value] ?? value)}`;
    case 'add_label': return `add the label ${quote(value)}`;
    case 'remove_label': return `remove the label ${quote(value)}`;
    case 'assign_to': return `assign it to ${context.memberName?.(value) ?? 'a member'}`;
    case 'assign_to_actor': return `assign it to ${actorPhrase(trigger.type)}`;
    case 'unassign_all': return 'remove all assignees';
    case 'add_comment': return `post the comment ${quote(truncate(value))}`;
    case 'move_to_backlog': return 'move it to the backlog';
    default: return 'do nothing';
  }
};

/**
 * One readable sentence for a rule, e.g.
 * "When a task moves to In progress, if it has no assignee, assign it to the person who moved it".
 */
export const describeRule = (rule: DescribableRule, context: DescribeContext = {}): string => {
  const conditions = rule.conditions.map(describeCondition);
  const actions = rule.actions.map(action => describeAction(action, rule.trigger, context));
  const when = `When ${describeTrigger(rule.trigger)}`;
  const condition = conditions.length > 0 ? `, if ${joinList(conditions)}` : '';
  const then = actions.length > 0 ? `, ${joinList(actions)}` : '';
  return `${when}${condition}${then}`;
};
