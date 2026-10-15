// Automation rules: "When <trigger>, if <conditions>, then <actions>" (server: models/automationModel.ts)
export const TRIGGER_TYPES = [
  'task.created', 'task.status_changed', 'task.assigned', 'task.priority_changed', 'task.commented', 'task.labeled',
] as const;
export const CONDITION_FIELDS = ['type', 'priority', 'status', 'label', 'assignee', 'sprint'] as const;
export const ACTION_TYPES = [
  'set_status', 'set_priority', 'add_label', 'remove_label', 'assign_to', 'assign_to_actor',
  'unassign_all', 'add_comment', 'move_to_backlog',
] as const;

export type TriggerType = (typeof TRIGGER_TYPES)[number];
export type ConditionField = (typeof CONDITION_FIELDS)[number];
export type ConditionOp = 'is' | 'is_not' | 'has' | 'has_not' | 'is_empty' | 'is_not_empty' | 'is_set';
export type ActionType = (typeof ACTION_TYPES)[number];

export const MAX_RULES = 25;
export const MAX_RULE_NAME = 80;
export const MAX_CONDITIONS = 5;
export const MAX_ACTIONS = 5;
export const MAX_COMMENT = 500;
export const MAX_VALUE = 40;

export interface AutomationTrigger {
  type: TriggerType;
  /** New status or priority, or the label that was added; '' = any */
  to: string;
}

export interface AutomationCondition {
  field: ConditionField;
  op: ConditionOp;
  value: string;
}

export interface AutomationAction {
  type: ActionType;
  value: string;
}

export interface Automation {
  _id: string;
  name: string;
  enabled: boolean;
  /** Project name the rule is limited to; '' = every project */
  project: string;
  trigger: AutomationTrigger;
  conditions: AutomationCondition[];
  actions: AutomationAction[];
  runCount: number;
  lastRunAt: string | null;
  createdBy: { _id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
}

/** The part of a rule the user edits (also the body of create and update requests). */
export interface AutomationInput {
  name: string;
  enabled: boolean;
  project: string;
  trigger: AutomationTrigger;
  conditions: AutomationCondition[];
  actions: AutomationAction[];
}

export interface AutomationTemplate {
  id: string;
  name: string;
  description: string;
  trigger: Partial<AutomationTrigger> & { type: TriggerType };
  conditions: AutomationCondition[];
  actions: AutomationAction[];
}
