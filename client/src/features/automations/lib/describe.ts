import i18n from '@/i18n';
import type {
  AutomationAction, AutomationCondition, AutomationTrigger, TriggerType,
} from '../types';
import { PRIORITY_LABELS, STATUS_LABELS, TYPE_LABELS } from './options';

/** The pieces of a rule needed to describe it (a saved rule, a template or a draft). */
export interface DescribableRule {
  trigger: Partial<AutomationTrigger> & { type: TriggerType };
  conditions: AutomationCondition[];
  actions: AutomationAction[];
}

export interface DescribeContext {
  /** Name of a member id; unknown ids read as "a member". */
  memberName?: (id: string) => string | undefined;
}

const t = (key: string, options?: Record<string, unknown>) => i18n.t(`admin:automations.describe.${key}`, options);
const lower = (text: string | undefined) => (text ?? '').toLowerCase();
/** English article for the type sentence; other languages do not use it. */
const article = (word: string) => (/^[aeiou]/i.test(word) ? 'an' : 'a');
const truncate = (text: string, max = 60) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

const joinList = (parts: string[]): string =>
  parts.length <= 1 ? (parts[0] ?? '') : `${parts.slice(0, -1).join(t('listSep'))}${t('listAnd')}${parts[parts.length - 1]}`;

/** "a task moves to In progress". */
export const describeTrigger = (trigger: DescribableRule['trigger']): string => {
  const to = trigger.to ?? '';
  switch (trigger.type) {
    case 'task.created': return t('created');
    case 'task.status_changed': return to ? t('statusTo', { status: STATUS_LABELS[to] ?? to }) : t('statusAny');
    case 'task.assigned': return t('assigned');
    case 'task.priority_changed': return to ? t('priorityTo', { priority: lower(PRIORITY_LABELS[to] ?? to) }) : t('priorityAny');
    case 'task.commented': return t('commented');
    case 'task.labeled': return to ? t('labelTo', { label: to }) : t('labelAny');
    default: return t('something');
  }
};

/** "its priority is high", "it has no assignee". */
export const describeCondition = (condition: AutomationCondition): string => {
  const { field, op, value } = condition;
  switch (field) {
    case 'type': {
      const word = lower(TYPE_LABELS[value] ?? value);
      return t(op === 'is' ? 'typeIs' : 'typeIsNot', { word: i18n.language.startsWith('en') ? `${article(word)} ${word}` : word });
    }
    case 'priority': return t(op === 'is' ? 'priorityIs' : 'priorityIsNot', { value: lower(PRIORITY_LABELS[value] ?? value) });
    case 'status': return t(op === 'is' ? 'statusIs' : 'statusIsNot', { value: STATUS_LABELS[value] ?? value });
    case 'label': return t(op === 'has' ? 'hasLabel' : 'hasNotLabel', { label: value });
    case 'assignee': return t(op === 'is_empty' ? 'noAssignee' : 'hasAssignee');
    case 'sprint': return t(op === 'is_set' ? 'inSprint' : 'notInSprint');
    default: return t('matches');
  }
};

/** Who "the person who triggered it" is, depending on the trigger. */
const actorPhrase = (type: TriggerType): string => {
  const known: TriggerType[] = ['task.created', 'task.status_changed', 'task.priority_changed', 'task.commented', 'task.labeled'];
  return known.includes(type) ? t(`actor.${type}`) : t('actor.default');
};

/** "set its status to Completed", "add the label "triage"". */
export const describeAction = (action: AutomationAction, trigger: DescribableRule['trigger'], context: DescribeContext = {}): string => {
  const { type, value } = action;
  switch (type) {
    case 'set_status': return t('setStatus', { value: STATUS_LABELS[value] ?? value });
    case 'set_priority': return t('setPriority', { value: lower(PRIORITY_LABELS[value] ?? value) });
    case 'add_label': return t('addLabel', { label: value });
    case 'remove_label': return t('removeLabel', { label: value });
    case 'assign_to': return t('assignTo', { name: context.memberName?.(value) ?? t('aMember') });
    case 'assign_to_actor': return t('assignActor', { who: actorPhrase(trigger.type) });
    case 'unassign_all': return t('unassignAll');
    case 'add_comment': return t('addComment', { text: truncate(value) });
    case 'move_to_backlog': return t('moveBacklog');
    default: return t('nothing');
  }
};

/** The whole rule as one sentence: "When a task is created, set its priority to high". */
export const describeRule = (rule: DescribableRule, context: DescribeContext = {}): string => {
  const conditions = rule.conditions.map(describeCondition);
  const actions = rule.actions.map(action => describeAction(action, rule.trigger, context));
  const when = t('when', { trigger: describeTrigger(rule.trigger) });
  const condition = conditions.length > 0 ? t('ifPart', { list: joinList(conditions) }) : '';
  const then = actions.length > 0 ? t('thenPart', { list: joinList(actions) }) : '';
  return `${when}${condition}${then}`;
};
