import { MAX_PENDING_CHANGES, mergeBatches, pendingCount, planRefresh, withoutOwn } from '../lib/merge';
import type { LiveBatch, LiveChange } from '../types';

const change = (id: string, action: string, actor = 'u2', task?: string): LiveChange => ({
  id, action, task, actor: { _id: actor, name: actor }, summary: id, fields: [], at: '2026-01-01T00:00:00.000Z',
});
const batch = (changes: LiveChange[], reset = false, slug = 'demo'): LiveBatch => ({ slug, changes, reset });

describe('withoutOwn', () => {
  it('drops the caller\'s own echoes and keeps the rest (including system entries)', () => {
    const changes = [change('1', 'task.updated', 'me'), change('2', 'task.updated', 'u2'), { ...change('3', 'automation.ran'), actor: null }];
    expect(withoutOwn(changes, 'me').map(item => item.id)).toEqual(['2', '3']);
    expect(withoutOwn(changes, undefined)).toHaveLength(3);
  });
});

describe('planRefresh', () => {
  it('reloads tasks for task changes, not projects', () => {
    expect(planRefresh(batch([change('1', 'task.updated')]))).toEqual({ tasks: true, projects: false, notifications: true });
    expect(planRefresh(batch([change('1', 'task.deleted')]))).toEqual({ tasks: true, projects: false, notifications: false });
  });

  it('reloads projects for project and sprint changes; sprint start, completion and deletion move tasks too', () => {
    expect(planRefresh(batch([change('1', 'project.updated')]))).toEqual({ tasks: false, projects: true, notifications: false });
    expect(planRefresh(batch([change('1', 'sprint.created')]))).toEqual({ tasks: false, projects: true, notifications: false });
    expect(planRefresh(batch([change('1', 'sprint.completed')]))).toMatchObject({ tasks: true, projects: true });
    expect(planRefresh(batch([change('1', 'project.deleted')]))).toMatchObject({ tasks: true, projects: true });
  });

  it('ignores changes that no cache shows', () => {
    expect(planRefresh(batch([change('1', 'member.joined'), change('2', 'workspace.updated')])))
      .toEqual({ tasks: false, projects: false, notifications: false });
  });

  it('reloads everything on reset', () => {
    expect(planRefresh(batch([], true))).toEqual({ tasks: true, projects: true, notifications: true });
  });
});

describe('mergeBatches', () => {
  it('queues changes in order without repeats', () => {
    const merged = mergeBatches(batch([change('1', 'task.updated')]), batch([change('1', 'task.updated'), change('2', 'task.created')]));
    expect(merged.changes.map(item => item.id)).toEqual(['1', '2']);
    expect(merged.reset).toBe(false);
  });

  it('starts over for another workspace', () => {
    const merged = mergeBatches(batch([change('1', 'task.updated')], false, 'a'), batch([change('2', 'task.updated')], false, 'b'));
    expect(merged).toEqual(batch([change('2', 'task.updated')], false, 'b'));
  });

  it('collapses into a reset once a reset arrives or the queue overflows', () => {
    expect(mergeBatches(batch([change('1', 'task.updated')]), batch([], true))).toEqual(batch([], true));
    expect(mergeBatches(batch([], true), batch([change('2', 'task.updated')]))).toEqual(batch([], true));
    const many = Array.from({ length: MAX_PENDING_CHANGES }, (_, i) => change(`a${i}`, 'task.updated'));
    expect(mergeBatches(batch(many), batch([change('extra', 'task.updated')]))).toEqual(batch([], true));
    expect(mergeBatches(batch(many), batch([change('a0', 'task.updated')])).reset).toBe(false);
  });

  it('counts what the pill shows', () => {
    expect(pendingCount(null)).toBe(0);
    expect(pendingCount(batch([change('1', 'task.updated'), change('2', 'task.created')]))).toBe(2);
    expect(pendingCount(batch([], true))).toBe(1);
  });
});
