import {
  draftFromRule, draftFromTemplate, emptyDraft, hasErrors, newActionRow, newConditionRow, toInput, validateDraft,
} from '../lib/draft';
import type { Automation, AutomationTemplate } from '../types';

const rule: Automation = {
  _id: 'r1', name: 'Bugs start high', enabled: false, project: 'Web',
  trigger: { type: 'task.created', to: '' },
  conditions: [{ field: 'type', op: 'is', value: 'bug' }],
  actions: [{ type: 'set_priority', value: 'high' }],
  runCount: 3, lastRunAt: null, createdBy: null, createdAt: '2026-10-10T00:00:00.000Z', updatedAt: '2026-10-10T00:00:00.000Z',
};

describe('drafts', () => {
  it('starts with one action and no conditions', () => {
    const draft = emptyDraft();
    expect(draft).toMatchObject({ name: '', enabled: true, project: '', conditions: [] });
    expect(draft.actions).toHaveLength(1);
    expect(draft.actions[0]).toMatchObject({ type: 'set_status', value: 'pending' });
  });

  it('round-trips a saved rule without the row keys', () => {
    const draft = draftFromRule(rule);
    expect(draft.conditions[0].key).toBeTruthy();
    expect(toInput(draft)).toEqual({
      name: 'Bugs start high', enabled: false, project: 'Web',
      trigger: { type: 'task.created', to: '' },
      conditions: [{ field: 'type', op: 'is', value: 'bug' }],
      actions: [{ type: 'set_priority', value: 'high' }],
    });
  });

  it('fills a draft from a template that omits the trigger value', () => {
    const template: AutomationTemplate = {
      id: 't', name: 'Template', description: '', trigger: { type: 'task.commented' }, conditions: [], actions: [{ type: 'unassign_all', value: '' }],
    };
    expect(draftFromTemplate(template)).toMatchObject({ name: 'Template', enabled: true, trigger: { type: 'task.commented', to: '' } });
  });

  it('gives every row its own key and sensible defaults', () => {
    const a = newConditionRow();
    const b = newConditionRow('label');
    expect(a.key).not.toBe(b.key);
    expect(a).toMatchObject({ field: 'type', op: 'is', value: 'story' });
    expect(b).toMatchObject({ field: 'label', op: 'has', value: '' });
    expect(newActionRow('assign_to_actor')).toMatchObject({ type: 'assign_to_actor', value: '' });
  });

  it('drops values the trigger, condition or action does not use', () => {
    const draft = emptyDraft();
    draft.name = '  Tidy  ';
    draft.trigger = { type: 'task.created', to: 'stale' };
    draft.conditions = [{ ...newConditionRow('assignee'), value: 'stale' }];
    draft.actions = [{ ...newActionRow('unassign_all'), value: 'stale' }];
    expect(toInput(draft)).toMatchObject({
      name: 'Tidy',
      trigger: { type: 'task.created', to: '' },
      conditions: [{ field: 'assignee', op: 'is_empty', value: '' }],
      actions: [{ type: 'unassign_all', value: '' }],
    });
  });
});

describe('validateDraft', () => {
  it('accepts a complete draft', () => {
    const draft = draftFromRule(rule);
    expect(hasErrors(validateDraft(draft))).toBe(false);
  });

  it('asks for a name', () => {
    const draft = draftFromRule(rule);
    draft.name = '   ';
    expect(validateDraft(draft).name).toMatch(/name/i);
  });

  it('points at the rows that need a value', () => {
    const draft = draftFromRule(rule);
    draft.conditions = [newConditionRow('label')];
    draft.actions = [{ ...newActionRow('assign_to'), value: '' }, { ...newActionRow('add_comment'), value: ' ' }, newActionRow('set_status')];
    const errors = validateDraft(draft);
    expect(errors.conditions).toEqual(['Enter a label']);
    expect(errors.actions).toEqual(['Choose a member', 'Write the comment', undefined]);
    expect(hasErrors(errors)).toBe(true);
  });

  it('needs an action and respects the limits', () => {
    const draft = draftFromRule(rule);
    draft.actions = [];
    expect(validateDraft(draft).form).toMatch(/at least one action/i);
    draft.actions = Array.from({ length: 6 }, () => newActionRow('unassign_all'));
    expect(validateDraft(draft).form).toMatch(/up to 5 actions/);
    draft.actions = [newActionRow()];
    draft.conditions = Array.from({ length: 6 }, () => newConditionRow());
    expect(validateDraft(draft).form).toMatch(/up to 5 conditions/);
    draft.conditions = [];
    draft.actions = [{ ...newActionRow('add_label'), value: 'x'.repeat(41) }];
    expect(validateDraft(draft).actions[0]).toMatch(/40/);
  });
});
