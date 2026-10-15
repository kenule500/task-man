import { daysLeftLabel, summarizeActiveSprints } from '../sprintSummary';
import type { Project, Sprint } from '@/features/projects';
import type { Task } from '@/features/tasks';

const sprint = (overrides: Partial<Sprint>): Sprint => ({
  _id: 's1', project: 'p1', name: 'Sprint 1', startDate: '2030-01-06T00:00:00.000Z', endDate: '2030-01-19T00:00:00.000Z',
  status: 'active', ...overrides,
});
const project = (overrides: Partial<Project>): Project => ({
  _id: 'p1', name: 'Web', key: 'WEB', color: 'blue', icon: 'code', archived: false, sprints: [], ...overrides,
});
const task = (overrides: Partial<Task>): Task => ({
  _id: Math.random().toString(36), title: 'T', status: 'pending', priority: 'medium', deadline: '2030-01-10', position: 0,
  dependencies: [], ...overrides,
});

describe('summarizeActiveSprints', () => {
  const today = new Date(2030, 0, 15);

  it('measures progress by story points of top-level items and counts days left', () => {
    const projects = [project({ sprints: [sprint({})] })];
    const tasks = [
      task({ sprint: 's1', storyPoints: 5, status: 'completed' }),
      task({ sprint: 's1', storyPoints: 3 }),
      task({ sprint: 's1', parent: 'x', status: 'completed', storyPoints: 8 }),
      task({ sprint: 'other', storyPoints: 13, status: 'completed' }),
    ];
    const [summary] = summarizeActiveSprints(projects, tasks, today);
    expect(summary).toMatchObject({ total: 2, completed: 1, points: 8, completedPoints: 5, progress: 63, daysLeft: 4 });
  });

  it('falls back to item counts for unestimated sprints and skips planned, completed and archived ones', () => {
    const projects = [
      project({ sprints: [sprint({}), sprint({ _id: 's2', status: 'planned' }), sprint({ _id: 's3', status: 'completed' })] }),
      project({ _id: 'p2', archived: true, sprints: [sprint({ _id: 's4', project: 'p2' })] }),
    ];
    const tasks = [task({ sprint: 's1', status: 'completed' }), task({ sprint: 's1' }), task({ sprint: 's1' }), task({ sprint: 's1' })];
    const result = summarizeActiveSprints(projects, tasks, today);
    expect(result.map(item => item.sprint._id)).toEqual(['s1']);
    expect(result[0].progress).toBe(25);
  });

  it('sorts by the sprint ending soonest', () => {
    const projects = [
      project({ sprints: [sprint({ _id: 'late', endDate: '2030-01-30' })] }),
      project({ _id: 'p2', sprints: [sprint({ _id: 'soon', project: 'p2', endDate: '2030-01-16' })] }),
    ];
    expect(summarizeActiveSprints(projects, [], today).map(item => item.sprint._id)).toEqual(['soon', 'late']);
  });
});

describe('daysLeftLabel', () => {
  it('reads naturally', () => {
    expect(daysLeftLabel(3)).toBe('3 days left');
    expect(daysLeftLabel(1)).toBe('1 day left');
    expect(daysLeftLabel(0)).toBe('Ends today');
    expect(daysLeftLabel(-2)).toBe('Ended 2 days ago');
  });
});
