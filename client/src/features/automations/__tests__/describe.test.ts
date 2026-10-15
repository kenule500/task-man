import { describeAction, describeCondition, describeRule, describeTrigger } from '../lib/describe';
import type { AutomationAction, AutomationCondition } from '../types';

const cond = (field: AutomationCondition['field'], op: AutomationCondition['op'], value = ''): AutomationCondition => ({ field, op, value });
const act = (type: AutomationAction['type'], value = ''): AutomationAction => ({ type, value });

describe('describeRule', () => {
  it('reads the assign-on-start recipe as one sentence', () => {
    expect(describeRule({
      trigger: { type: 'task.status_changed', to: 'in-progress' },
      conditions: [cond('assignee', 'is_empty')],
      actions: [act('assign_to_actor')],
    })).toBe('When a task moves to In progress, if it has no assignee, assign it to the person who moved it');
  });

  it('leaves out the "if" part without conditions and joins several actions', () => {
    expect(describeRule({
      trigger: { type: 'task.created' },
      conditions: [],
      actions: [act('set_priority', 'high'), act('add_label', 'triage'), act('move_to_backlog')],
    })).toBe('When a task is created, set its priority to high, add the label "triage" and move it to the backlog');
  });

  it('joins several conditions with "and"', () => {
    expect(describeRule({
      trigger: { type: 'task.commented' },
      conditions: [cond('status', 'is', 'completed'), cond('label', 'has_not', 'archived')],
      actions: [act('set_status', 'in-progress')],
    })).toBe('When a comment is added to a task, if its status is Completed and it does not have the label "archived", set its status to In progress');
  });

  it('uses member names and falls back for unknown members', () => {
    const rule = { trigger: { type: 'task.created' as const }, conditions: [], actions: [act('assign_to', 'u1')] };
    expect(describeRule(rule, { memberName: id => (id === 'u1' ? 'Dana' : undefined) })).toBe('When a task is created, assign it to Dana');
    expect(describeRule(rule)).toBe('When a task is created, assign it to a member');
  });
});

describe('parts of the sentence', () => {
  it('describes every trigger', () => {
    expect(describeTrigger({ type: 'task.status_changed' })).toBe('a task changes status');
    expect(describeTrigger({ type: 'task.assigned' })).toBe('someone is assigned to a task');
    expect(describeTrigger({ type: 'task.priority_changed', to: 'high' })).toBe("a task's priority changes to high");
    expect(describeTrigger({ type: 'task.priority_changed' })).toBe("a task's priority changes");
    expect(describeTrigger({ type: 'task.labeled', to: 'reviewed' })).toBe('the label "reviewed" is added to a task');
    expect(describeTrigger({ type: 'task.labeled' })).toBe('a label is added to a task');
  });

  it('describes conditions with the right article', () => {
    expect(describeCondition(cond('type', 'is', 'bug'))).toBe('it is a bug');
    expect(describeCondition(cond('type', 'is_not', 'epic'))).toBe('it is not an epic');
    expect(describeCondition(cond('priority', 'is_not', 'low'))).toBe('its priority is not low');
    expect(describeCondition(cond('assignee', 'is_not_empty'))).toBe('it has an assignee');
    expect(describeCondition(cond('sprint', 'is_set'))).toBe('it is in a sprint');
    expect(describeCondition(cond('sprint', 'is_empty'))).toBe('it is not in a sprint');
  });

  it('names the person who triggered the rule after the trigger and shortens long comments', () => {
    expect(describeAction(act('assign_to_actor'), { type: 'task.created' })).toBe('assign it to the person who created it');
    expect(describeAction(act('assign_to_actor'), { type: 'task.commented' })).toBe('assign it to the person who commented');
    expect(describeAction(act('unassign_all'), { type: 'task.created' })).toBe('remove all assignees');
    const long = describeAction(act('add_comment', 'x'.repeat(100)), { type: 'task.created' });
    expect(long.length).toBeLessThan(90);
    expect(long.endsWith('…"')).toBe(true);
  });
});
