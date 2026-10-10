import {
  MAX_ACTIONS, MAX_COMMENT, MAX_CONDITIONS, MAX_RULE_NAME, MAX_VALUE,
  type Automation, type AutomationAction, type AutomationCondition, type AutomationInput, type AutomationTemplate,
} from '../types';
import { CONDITION_OPTIONS, actionValueKind, choicesFor, triggerValueKind, type ValueKind } from './options';

// Rows of the rule builder carry a key so React keeps them apart when one is removed
let rowCounter = 0;
const rowKey = () => `row-${(rowCounter += 1)}`;

export interface ConditionRow extends AutomationCondition { key: string }
export interface ActionRow extends AutomationAction { key: string }

export interface RuleDraft {
  name: string;
  project: string;
  enabled: boolean;
  trigger: AutomationInput['trigger'];
  conditions: ConditionRow[];
  actions: ActionRow[];
}

/** A value to start from when a row switches to a field/action that takes the given kind of value. */
export const defaultValueFor = (kind: ValueKind): string => choicesFor(kind)[0]?.value ?? '';

export const newConditionRow = (field: AutomationCondition['field'] = 'type'): ConditionRow => ({
  key: rowKey(),
  field,
  op: CONDITION_OPTIONS[field].ops[0].value,
  value: defaultValueFor(CONDITION_OPTIONS[field].valueKind),
});

export const newActionRow = (type: AutomationAction['type'] = 'set_status'): ActionRow => ({
  key: rowKey(),
  type,
  value: defaultValueFor(actionValueKind(type)),
});

export const emptyDraft = (): RuleDraft => ({
  name: '',
  project: '',
  enabled: true,
  trigger: { type: 'task.created', to: '' },
  conditions: [],
  actions: [newActionRow()],
});

export const draftFromRule = (rule: Automation): RuleDraft => ({
  name: rule.name,
  project: rule.project,
  enabled: rule.enabled,
  trigger: { type: rule.trigger.type, to: rule.trigger.to ?? '' },
  conditions: rule.conditions.map(condition => ({ ...condition, key: rowKey() })),
  actions: rule.actions.map(action => ({ ...action, key: rowKey() })),
});

export const draftFromTemplate = (template: AutomationTemplate): RuleDraft => ({
  name: template.name,
  project: '',
  enabled: true,
  trigger: { type: template.trigger.type, to: template.trigger.to ?? '' },
  conditions: template.conditions.map(condition => ({ ...condition, key: rowKey() })),
  actions: template.actions.map(action => ({ ...action, key: rowKey() })),
});

export interface DraftErrors {
  name?: string;
  trigger?: string;
  conditions: (string | undefined)[];
  actions: (string | undefined)[];
  /** Problems that belong to no single row (no action, too many rows) */
  form?: string;
}

const labelError = (value: string): string | undefined => {
  const text = value.trim();
  if (!text) return 'Enter a label';
  return text.length > MAX_VALUE ? `Labels can have up to ${MAX_VALUE} characters` : undefined;
};

/** Checks a draft the way the server does, so the form can point at the field to fix. */
export const validateDraft = (draft: RuleDraft): DraftErrors => {
  const errors: DraftErrors = { conditions: [], actions: [] };
  const name = draft.name.trim();
  if (!name) errors.name = 'Give the rule a name';
  else if (name.length > MAX_RULE_NAME) errors.name = `Names can have up to ${MAX_RULE_NAME} characters`;

  if (triggerValueKind(draft.trigger.type) === 'label' && draft.trigger.to.trim().length > MAX_VALUE) {
    errors.trigger = `Labels can have up to ${MAX_VALUE} characters`;
  }

  errors.conditions = draft.conditions.map(condition =>
    CONDITION_OPTIONS[condition.field].valueKind === 'label' ? labelError(condition.value) : undefined);

  errors.actions = draft.actions.map(action => {
    const kind = actionValueKind(action.type);
    if (kind === 'label') return labelError(action.value);
    if (kind === 'member') return action.value ? undefined : 'Choose a member';
    if (kind === 'comment') {
      const text = action.value.trim();
      if (!text) return 'Write the comment';
      return text.length > MAX_COMMENT ? `Comments can have up to ${MAX_COMMENT} characters` : undefined;
    }
    return undefined;
  });

  if (draft.actions.length === 0) errors.form = 'Add at least one action';
  else if (draft.actions.length > MAX_ACTIONS) errors.form = `A rule can have up to ${MAX_ACTIONS} actions`;
  else if (draft.conditions.length > MAX_CONDITIONS) errors.form = `A rule can have up to ${MAX_CONDITIONS} conditions`;
  return errors;
};

export const hasErrors = (errors: DraftErrors): boolean =>
  Boolean(errors.name || errors.trigger || errors.form)
  || errors.conditions.some(Boolean)
  || errors.actions.some(Boolean);

/** The request body for a draft; values that the rule does not use are dropped. */
export const toInput = (draft: RuleDraft): AutomationInput => ({
  name: draft.name.trim(),
  enabled: draft.enabled,
  project: draft.project.trim(),
  trigger: {
    type: draft.trigger.type,
    to: triggerValueKind(draft.trigger.type) ? draft.trigger.to.trim() : '',
  },
  conditions: draft.conditions.map(({ field, op, value }) => ({
    field, op, value: CONDITION_OPTIONS[field].valueKind ? value.trim() : '',
  })),
  actions: draft.actions.map(({ type, value }) => ({ type, value: actionValueKind(type) ? value.trim() : '' })),
});
