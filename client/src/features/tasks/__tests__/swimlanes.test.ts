import { ALL_LANE_ID, groupIntoSwimlanes, laneIdOf, parseSwimlaneGroup } from '../lib/swimlanes';
import { makeTask } from './fixtures';

const ada = { _id: 'u1', name: 'Ada' };
const grace = { _id: 'u2', name: 'Grace' };

describe('parseSwimlaneGroup', () => {
  it('accepts known groupings and falls back to none', () => {
    expect(parseSwimlaneGroup('assignee')).toBe('assignee');
    expect(parseSwimlaneGroup('project')).toBe('project');
    expect(parseSwimlaneGroup('sprint')).toBe('none');
    expect(parseSwimlaneGroup(null)).toBe('none');
  });
});

describe('groupIntoSwimlanes', () => {
  it('none returns a single lane with every task', () => {
    const tasks = [makeTask(), makeTask()];
    const lanes = groupIntoSwimlanes(tasks, 'none');
    expect(lanes).toHaveLength(1);
    expect(lanes[0]).toMatchObject({ id: ALL_LANE_ID, tasks });
  });

  it('groups by first assignee, sorted by name, Unassigned last', () => {
    const a = makeTask({ assignees: [ada, grace] });
    const g = makeTask({ assignees: [grace] });
    const none = makeTask();
    const a2 = makeTask({ assignees: [ada] });
    const lanes = groupIntoSwimlanes([none, g, a, a2], 'assignee');
    expect(lanes.map(lane => lane.label)).toEqual(['Ada', 'Grace', 'Unassigned']);
    expect(lanes[0].tasks).toEqual([a, a2]);
    expect(lanes[2].tasks).toEqual([none]);
  });

  it('puts every task in exactly one lane', () => {
    const tasks = [makeTask({ assignees: [ada, grace] }), makeTask({ assignees: [grace] }), makeTask()];
    const total = groupIntoSwimlanes(tasks, 'assignee').reduce((sum, lane) => sum + lane.tasks.length, 0);
    expect(total).toBe(tasks.length);
  });

  it('groups by project with "No project" last', () => {
    const lanes = groupIntoSwimlanes(
      [makeTask({ project: 'Web' }), makeTask({ project: '' }), makeTask({ project: 'Api' }), makeTask({ project: 'Web' })],
      'project',
    );
    expect(lanes.map(lane => [lane.label, lane.tasks.length])).toEqual([['Api', 1], ['Web', 2], ['No project', 1]]);
  });

  it('groups by type in workflow order, treating a missing type as task, skipping empty lanes', () => {
    const lanes = groupIntoSwimlanes(
      [makeTask({ type: 'bug' }), makeTask(), makeTask({ type: 'story' }), makeTask({ type: 'task' })],
      'type',
    );
    expect(lanes.map(lane => [lane.label, lane.tasks.length])).toEqual([['Story', 1], ['Task', 2], ['Bug', 1]]);
  });

  it('laneIdOf matches the lane a task is grouped into', () => {
    const task = makeTask({ assignees: [grace], project: 'Web', type: 'bug' });
    for (const group of ['assignee', 'project', 'type'] as const) {
      expect(groupIntoSwimlanes([task], group)[0].id).toBe(laneIdOf(task, group));
    }
    expect(laneIdOf(task, 'none')).toBe(ALL_LANE_ID);
  });
});
