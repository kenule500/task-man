import { eventsFromActivity, matchesConditions, matchesTrigger, planActions, type RuleTask } from '../utils/automation/engine.js';
import { parseActions, parseConditions, parseTrigger } from '../utils/automation/validate.js';
import { AUTOMATION_TEMPLATES } from '../utils/automation/templates.js';
import type { IAutomationAction, IAutomationCondition } from '../models/automationModel.js';

const ME = 'a'.repeat(24);
const BOB = 'b'.repeat(24);
const baseTask: RuleTask = { title: 'Fix login', status: 'pending', priority: 'medium', type: 'bug', labels: ['blocked'], assignees: [], sprint: null };
const cond = (field: IAutomationCondition['field'], op: IAutomationCondition['op'], value = ''): IAutomationCondition => ({ field, op, value });
const act = (type: IAutomationAction['type'], value = ''): IAutomationAction => ({ type, value });

describe('eventsFromActivity', () => {
  it('maps created and commented entries', () => {
    expect(eventsFromActivity('task.created')).toEqual([{ type: 'task.created', values: [] }]);
    expect(eventsFromActivity('task.commented')).toEqual([{ type: 'task.commented', values: [] }]);
    expect(eventsFromActivity('project.updated', [{ field: 'status', to: 'completed' }])).toEqual([]);
  });

  it('reads status, priority, labels and assignees from an update', () => {
    const events = eventsFromActivity('task.updated', [
      { field: 'status', from: 'pending', to: 'in-progress' },
      { field: 'priority', from: 'low', to: 'high' },
      { field: 'labels', from: 'a, b', to: 'a, b, Reviewed' },
      { field: 'assignees', from: '0', to: '1' },
    ]);
    expect(events).toEqual([
      { type: 'task.status_changed', values: ['in-progress'] },
      { type: 'task.priority_changed', values: ['high'] },
      { type: 'task.labeled', values: ['Reviewed'] },
      { type: 'task.assigned', values: [] },
    ]);
  });

  it('ignores removed labels and removed assignees', () => {
    expect(eventsFromActivity('task.updated', [
      { field: 'labels', from: 'a, b', to: 'a' },
      { field: 'assignees', from: '2', to: '1' },
      { field: 'assignees', from: '1', to: '0' },
    ])).toEqual([]);
  });
});

describe('matchesTrigger', () => {
  it('matches the type and, when set, the value case-insensitively', () => {
    const event = { type: 'task.labeled' as const, values: ['Reviewed'] };
    expect(matchesTrigger({ type: 'task.labeled' }, event)).toBe(true);
    expect(matchesTrigger({ type: 'task.labeled', to: 'reviewed' }, event)).toBe(true);
    expect(matchesTrigger({ type: 'task.labeled', to: 'other' }, event)).toBe(false);
    expect(matchesTrigger({ type: 'task.created' }, event)).toBe(false);
  });
});

describe('matchesConditions', () => {
  it('needs every condition to hold and passes with none', () => {
    expect(matchesConditions([], baseTask)).toBe(true);
    expect(matchesConditions([cond('type', 'is', 'bug'), cond('priority', 'is_not', 'high')], baseTask)).toBe(true);
    expect(matchesConditions([cond('type', 'is', 'bug'), cond('priority', 'is', 'high')], baseTask)).toBe(false);
  });

  it('checks labels, assignees, sprint and status', () => {
    expect(matchesConditions([cond('label', 'has', 'BLOCKED')], baseTask)).toBe(true);
    expect(matchesConditions([cond('label', 'has_not', 'blocked')], baseTask)).toBe(false);
    expect(matchesConditions([cond('assignee', 'is_empty')], baseTask)).toBe(true);
    expect(matchesConditions([cond('assignee', 'is_not_empty')], { ...baseTask, assignees: [ME] })).toBe(true);
    expect(matchesConditions([cond('sprint', 'is_empty')], baseTask)).toBe(true);
    expect(matchesConditions([cond('sprint', 'is_set')], { ...baseTask, sprint: 'x' })).toBe(true);
    expect(matchesConditions([cond('status', 'is', 'pending')], baseTask)).toBe(true);
  });
});

describe('planActions', () => {
  const ctx = { actorId: ME, memberIds: [ME, BOB] };

  it('applies status and priority and reports them as changes', () => {
    const plan = planActions({ actions: [act('set_status', 'completed'), act('set_priority', 'high')] }, baseTask, ctx);
    expect(plan.patch).toEqual({ status: 'completed', priority: 'high' });
    expect(plan.changes).toEqual([
      { field: 'status', from: 'pending', to: 'completed' },
      { field: 'priority', from: 'medium', to: 'high' },
    ]);
  });

  it('plans nothing when the task already looks as the rule wants', () => {
    const plan = planActions({ actions: [act('set_status', 'pending'), act('add_label', 'Blocked')] }, baseTask, ctx);
    expect(plan.patch).toEqual({});
    expect(plan.changes).toEqual([]);
  });

  it('adds and removes labels without duplicates and within the limit', () => {
    expect(planActions({ actions: [act('add_label', 'urgent'), act('add_label', 'URGENT')] }, baseTask, ctx).patch.labels).toEqual(['blocked', 'urgent']);
    expect(planActions({ actions: [act('remove_label', 'Blocked')] }, baseTask, ctx).patch.labels).toEqual([]);
    const full = { ...baseTask, labels: Array.from({ length: 10 }, (_, index) => `l${index}`) };
    expect(planActions({ actions: [act('add_label', 'extra')] }, full, ctx).patch.labels).toBeUndefined();
  });

  it('assigns members and the actor, skipping strangers', () => {
    expect(planActions({ actions: [act('assign_to', BOB)] }, baseTask, ctx).patch.assignees).toEqual([BOB]);
    expect(planActions({ actions: [act('assign_to', 'c'.repeat(24))] }, baseTask, ctx).patch.assignees).toBeUndefined();
    expect(planActions({ actions: [act('assign_to_actor')] }, baseTask, ctx).patch.assignees).toEqual([ME]);
    expect(planActions({ actions: [act('assign_to_actor')] }, baseTask, { memberIds: [ME] }).patch.assignees).toBeUndefined();
    expect(planActions({ actions: [act('assign_to_actor')] }, { ...baseTask, assignees: [ME] }, ctx).patch.assignees).toBeUndefined();
  });

  it('unassigns everyone and moves to the backlog', () => {
    const task = { ...baseTask, assignees: [ME, BOB], sprint: 'sprint1' };
    const plan = planActions({ actions: [act('unassign_all'), act('move_to_backlog')] }, task, ctx);
    expect(plan.patch).toEqual({ assignees: [], sprint: null });
    expect(plan.changes).toContainEqual({ field: 'assignees', from: '2', to: '0' });
    expect(plan.changes).toContainEqual({ field: 'sprint', from: 'sprint1', to: undefined });
  });

  it('adds a comment only when someone triggered the rule', () => {
    expect(planActions({ actions: [act('add_comment', 'Hello')] }, baseTask, ctx).comments).toEqual(['Hello']);
    expect(planActions({ actions: [act('add_comment', 'Hello')] }, baseTask, { memberIds: [] }).comments).toEqual([]);
  });

  it('lets later actions build on earlier ones', () => {
    const plan = planActions({ actions: [act('unassign_all'), act('assign_to', BOB)] }, { ...baseTask, assignees: [ME] }, ctx);
    expect(plan.patch.assignees).toEqual([BOB]);
  });
});

describe('rule validation', () => {
  it('parses triggers and rejects bad values', () => {
    expect(parseTrigger({ type: 'task.created' }).value).toEqual({ type: 'task.created', to: '' });
    expect(parseTrigger({ type: 'task.status_changed', to: 'completed' }).value).toEqual({ type: 'task.status_changed', to: 'completed' });
    expect(parseTrigger({ type: 'task.status_changed', to: 'done' }).error).toBeDefined();
    expect(parseTrigger({ type: 'task.created', to: 'x' }).error).toBeDefined();
    expect(parseTrigger({ type: 'task.labeled', to: 'x'.repeat(41) }).error).toBeDefined();
    expect(parseTrigger({ type: 'nope' }).error).toBeDefined();
    expect(parseTrigger(null).error).toBeDefined();
  });

  it('parses conditions and limits them to five', () => {
    expect(parseConditions(undefined).value).toEqual([]);
    expect(parseConditions([{ field: 'assignee', op: 'is_empty', value: 'ignored' }]).value).toEqual([{ field: 'assignee', op: 'is_empty', value: '' }]);
    expect(parseConditions([{ field: 'type', op: 'has', value: 'bug' }]).error).toBeDefined();
    expect(parseConditions([{ field: 'type', op: 'is', value: 'saga' }]).error).toBeDefined();
    expect(parseConditions([{ field: 'label', op: 'has', value: '' }]).error).toBeDefined();
    expect(parseConditions(Array.from({ length: 6 }, () => ({ field: 'type', op: 'is', value: 'bug' }))).error).toBeDefined();
    expect(parseConditions('x').error).toBeDefined();
  });

  it('parses actions and limits them to five', () => {
    expect(parseActions([{ type: 'set_priority', value: 'high' }]).value).toEqual([{ type: 'set_priority', value: 'high' }]);
    expect(parseActions([]).error).toBeDefined();
    expect(parseActions([{ type: 'set_status', value: 'nope' }]).error).toBeDefined();
    expect(parseActions([{ type: 'assign_to', value: 'not-an-id' }]).error).toBeDefined();
    expect(parseActions([{ type: 'add_comment', value: 'x'.repeat(501) }]).error).toBeDefined();
    expect(parseActions([{ type: 'add_comment', value: '  ' }]).error).toBeDefined();
    expect(parseActions(Array.from({ length: 6 }, () => ({ type: 'unassign_all' }))).error).toBeDefined();
  });

  it('accepts every template', () => {
    expect(AUTOMATION_TEMPLATES.length).toBeGreaterThanOrEqual(6);
    for (const template of AUTOMATION_TEMPLATES) {
      expect(parseTrigger(template.trigger).error).toBeUndefined();
      expect(parseConditions(template.conditions).error).toBeUndefined();
      expect(parseActions(template.actions).error).toBeUndefined();
    }
  });
});
