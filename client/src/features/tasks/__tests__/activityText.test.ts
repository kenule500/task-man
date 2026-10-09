import type { TaskActivityEntry } from '../api';
import { describeActivity, describeChange } from '../lib/activityText';

const entry = (overrides: Partial<TaskActivityEntry>): TaskActivityEntry => ({
  _id: 'a1', action: 'task.updated', actor: { _id: 'u1', name: 'Ada' }, changes: [], createdAt: '2026-10-09T10:00:00.000Z', ...overrides,
});

describe('describeChange', () => {
  it('uses labels for status, priority and type', () => {
    expect(describeChange({ field: 'status', from: 'pending', to: 'in-progress' })).toBe('changed status from Pending to In Progress');
    expect(describeChange({ field: 'priority', from: 'low', to: 'high' })).toBe('changed priority from Low to High');
    expect(describeChange({ field: 'type', to: 'bug' })).toBe('set type to Bug');
  });

  it('formats dates as calendar days', () => {
    expect(describeChange({ field: 'deadline', from: '2026-10-09', to: '2026-10-12' })).toBe('changed the due date from Oct 9, 2026 to Oct 12, 2026');
    expect(describeChange({ field: 'startDate', to: '2026-10-01' })).toBe('set the start date to Oct 1, 2026');
    expect(describeChange({ field: 'deadline', from: '2026-10-09' })).toBe('cleared the due date');
  });

  it('describes titles, points, projects and labels', () => {
    expect(describeChange({ field: 'title', from: 'Old', to: 'New' })).toBe('renamed the task from "Old" to "New"');
    expect(describeChange({ field: 'storyPoints', from: '3', to: '5' })).toBe('changed story points from 3 to 5');
    expect(describeChange({ field: 'storyPoints', to: '1' })).toBe('estimated this at 1 point');
    expect(describeChange({ field: 'storyPoints', from: '3' })).toBe('cleared the story points');
    expect(describeChange({ field: 'project', from: 'A', to: 'B' })).toBe('moved this from project A to B');
    expect(describeChange({ field: 'labels', from: 'x', to: 'x, y' })).toBe('changed labels from x to x, y');
    expect(describeChange({ field: 'labels', from: 'x' })).toBe('removed all labels');
  });

  it('never shows sprint ids; names them only when known', () => {
    expect(describeChange({ field: 'sprint', from: 'id1', to: 'id2' })).toBe('changed the sprint');
    expect(describeChange({ field: 'sprint', to: 'id2' })).toBe('moved this to a sprint');
    expect(describeChange({ field: 'sprint', from: 'id1' })).toBe('moved this to the backlog');
    const sprintName = (id: string) => ({ id1: 'Sprint 1', id2: 'Sprint 2' })[id];
    expect(describeChange({ field: 'sprint', from: 'id1', to: 'id2' }, { sprintName })).toBe('moved this from Sprint 1 to Sprint 2');
  });

  it('handles assignee counts, description, parent and unknown fields', () => {
    expect(describeChange({ field: 'assignees', from: '1', to: '3' })).toBe('added 2 assignees');
    expect(describeChange({ field: 'assignees', from: '1', to: '0' })).toBe('removed 1 assignee');
    expect(describeChange({ field: 'assignees', from: '1', to: '1' })).toBe('changed the assignees');
    expect(describeChange({ field: 'description' })).toBe('edited the description');
    expect(describeChange({ field: 'parent', to: 'p1' })).toBe('made this a subtask');
    expect(describeChange({ field: 'parent', from: 'p1' })).toBe('made this a standalone task');
    expect(describeChange({ field: 'mystery' })).toBe('changed mystery');
  });
});

describe('describeActivity', () => {
  it('describes lifecycle, comment and file actions', () => {
    expect(describeActivity(entry({ action: 'task.created' })).headline).toBe('created this task');
    expect(describeActivity(entry({ action: 'task.created', changes: [{ field: 'parent', to: 'p' }] })).headline).toBe('created this subtask');
    expect(describeActivity(entry({ action: 'task.deleted', changes: [{ field: 'subtasks', from: '2' }] })).headline).toBe('deleted this task and 2 subtasks');
    expect(describeActivity(entry({ action: 'task.commented' })).headline).toBe('added a comment');
    expect(describeActivity(entry({ action: 'task.attachment_added', changes: [{ field: 'file', to: 'plan.pdf' }] })).headline).toBe('attached plan.pdf');
    expect(describeActivity(entry({ action: 'task.attachment_removed', changes: [{ field: 'file', from: 'plan.pdf' }] })).headline).toBe('removed the attachment plan.pdf');
  });

  it('puts a single change in the headline and several in a list', () => {
    const one = describeActivity(entry({ changes: [{ field: 'status', from: 'pending', to: 'completed' }] }));
    expect(one).toEqual({ headline: 'changed status from Pending to Completed', details: [] });

    const many = describeActivity(entry({ changes: [{ field: 'status', from: 'pending', to: 'completed' }, { field: 'description' }] }));
    expect(many.headline).toBe('made 2 changes');
    expect(many.details).toEqual(['Changed status from Pending to Completed', 'Edited the description']);
  });
});
