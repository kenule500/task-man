import { makeTask } from '@/features/tasks/__tests__/fixtures';
import { belongsToProject, groupProjectTasks, projectTasks, subtaskProgress } from '../lib/grouping';
import { makeProject, makeSprint } from './fixtures';

describe('belongsToProject', () => {
  it('matches the project name ignoring case and spacing', () => {
    const project = makeProject({ name: 'Website' });
    expect(belongsToProject(makeTask({ project: ' website ' }), project)).toBe(true);
    expect(belongsToProject(makeTask({ project: 'Other' }), project)).toBe(false);
    expect(belongsToProject(makeTask({}), project)).toBe(false);
  });

  it('filters the tasks of a project', () => {
    const project = makeProject({ name: 'Website' });
    const mine = makeTask({ project: 'WEBSITE' });
    expect(projectTasks([mine, makeTask({ project: 'App' })], project)).toEqual([mine]);
  });
});

describe('groupProjectTasks', () => {
  const active = makeSprint({ status: 'active' });
  const done = makeSprint({ status: 'completed' });

  it('splits tasks into sprints, backlog and subtasks', () => {
    const inSprint = makeTask({ sprint: active._id, position: 2 });
    const first = makeTask({ sprint: active._id, position: 1 });
    const loose = makeTask({ sprint: null });
    const child = makeTask({ parent: inSprint._id, sprint: active._id });

    const groups = groupProjectTasks([inSprint, first, loose, child], [active, done]);

    expect(groups.bySprint.get(active._id)).toEqual([first, inSprint]);
    expect(groups.bySprint.get(done._id)).toEqual([]);
    expect(groups.backlog).toEqual([loose]);
    expect(groups.subtasks.get(inSprint._id)).toEqual([child]);
  });

  it('keeps finished tasks in a completed sprint and sends open ones to the backlog', () => {
    const finished = makeTask({ sprint: done._id, status: 'completed' });
    const left = makeTask({ sprint: done._id, status: 'pending' });

    const groups = groupProjectTasks([finished, left], [done]);

    expect(groups.bySprint.get(done._id)).toEqual([finished]);
    expect(groups.backlog).toEqual([left]);
  });

  it('treats a task pointing at an unknown sprint as backlog', () => {
    const orphan = makeTask({ sprint: 'gone' });
    expect(groupProjectTasks([orphan], []).backlog).toEqual([orphan]);
  });
});

describe('subtaskProgress', () => {
  it('counts completed subtasks', () => {
    const subtasks = [makeTask({ status: 'completed' }), makeTask(), makeTask({ status: 'completed' })];
    expect(subtaskProgress(subtasks)).toEqual({ done: 2, total: 3 });
    expect(subtaskProgress(undefined)).toEqual({ done: 0, total: 0 });
  });
});
