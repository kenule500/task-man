import { getDependencyCandidates, getDependentIds } from '../lib/dependencies';
import type { Project } from '@/features/projects';
import {
  parseStoryPoints, sprintBelongsTo, sprintOptionsFor, storyPointOptions, toFormValues, toTaskInput, validateTaskForm,
} from '../lib/taskForm';
import { makeTask } from './fixtures';

const sprint = (id: string, status: 'planned' | 'active' | 'completed', name = id) =>
  ({ _id: id, project: 'p1', name, startDate: '2026-10-01', endDate: '2026-10-14', status });
const web: Project = {
  _id: 'p1', name: 'Website', key: 'WEB', color: 'blue', icon: 'folder', archived: false,
  sprints: [sprint('s1', 'completed', 'Sprint 1'), sprint('s2', 'active', 'Sprint 2'), sprint('s3', 'planned', 'Sprint 3')],
};

describe('scrum fields in the task form', () => {
  it('defaults to a task without estimate or sprint', () => {
    expect(toFormValues()).toMatchObject({ type: 'task', storyPoints: null, sprint: '' });
  });

  it('prefills type, points and sprint from the task', () => {
    expect(toFormValues(makeTask({ type: 'bug', storyPoints: 5, sprint: 's2' }))).toMatchObject({ type: 'bug', storyPoints: 5, sprint: 's2' });
  });

  it('maps the values to the API payload, backlog as null', () => {
    expect(toTaskInput({ ...toFormValues(), title: 'x', type: 'story', storyPoints: 8, sprint: 's2' })).toMatchObject({
      type: 'story', storyPoints: 8, sprint: 's2',
    });
    expect(toTaskInput({ ...toFormValues(), title: 'x' })).toMatchObject({ storyPoints: null, sprint: null });
  });

  it('leaves an unchanged sprint out when editing (a completed sprint cannot be re-assigned)', () => {
    const task = makeTask({ sprint: 's1', project: 'Website' });
    expect('sprint' in toTaskInput(toFormValues(task), task)).toBe(false);
    expect(toTaskInput({ ...toFormValues(task), sprint: 's2' }, task).sprint).toBe('s2');
    expect(toTaskInput({ ...toFormValues(task), sprint: '' }, task).sprint).toBeNull();
  });

  it('never sends a sprint for subtasks', () => {
    const sub = makeTask({ parent: 'p', sprint: null });
    expect('sprint' in toTaskInput({ ...toFormValues(sub), sprint: 's2' }, sub)).toBe(false);
  });

  it('offers the Fibonacci scale and keeps an off-scale value', () => {
    expect(storyPointOptions(null).map(option => option.value)).toEqual(['none', '0', '1', '2', '3', '5', '8', '13', '21']);
    const options = storyPointOptions(40);
    expect(options.map(option => option.value)).toContain('40');
    expect(options.find(option => option.value === 'none')?.label).toBe('Not estimated');
    expect(options.find(option => option.value === '1')?.label).toBe('1 point');
  });

  it('parses select values back to points', () => {
    expect(parseStoryPoints('none')).toBeNull();
    expect(parseStoryPoints('13')).toBe(13);
  });

  it('lists the backlog and the open sprints of the task project only', () => {
    expect(sprintOptionsFor([web], 'Website').map(option => option.value)).toEqual(['backlog', 's2', 's3']);
    expect(sprintOptionsFor([web], 'Website')[1].label).toBe('Sprint 2 (active)');
    expect(sprintOptionsFor([web], 'Other').map(option => option.value)).toEqual(['backlog']);
  });

  it('keeps the current sprint listed even when it is completed', () => {
    expect(sprintOptionsFor([web], 'Website', 's1').map(option => option.label)).toContain('Sprint 1 (completed)');
  });

  it('knows which project a sprint belongs to', () => {
    expect(sprintBelongsTo([web], ' Website ', 's2')).toBe(true);
    expect(sprintBelongsTo([web], 'Other', 's2')).toBe(false);
  });
});

describe('task form helpers', () => {
  it('prefills values from an existing task', () => {
    const task = makeTask({ title: 'Ship', startDate: '2026-10-01T00:00:00.000Z', deadline: '2026-10-05T00:00:00.000Z' });
    expect(toFormValues(task)).toMatchObject({ title: 'Ship', startDate: '2026-10-01', deadline: '2026-10-05' });
  });

  it('applies defaults for new tasks', () => {
    expect(toFormValues(null, { status: 'in-progress', deadline: '2026-11-01' })).toMatchObject({
      title: '',
      status: 'in-progress',
      deadline: '2026-11-01',
      startDate: '',
    });
  });

  it('requires a title and a deadline', () => {
    const errors = validateTaskForm({ ...toFormValues(), title: '  ', deadline: '' });
    expect(Object.keys(errors).sort()).toEqual(['deadline', 'title']);
  });

  it('rejects a start date after the deadline', () => {
    const errors = validateTaskForm({ ...toFormValues(), title: 'x', startDate: '2026-10-09', deadline: '2026-10-01' });
    expect(errors.startDate).toBeDefined();
  });

  it('prefills and trims the project label', () => {
    expect(toFormValues(makeTask({ project: 'Website' })).project).toBe('Website');
    expect(toFormValues().project).toBe('');
    expect(toTaskInput({ ...toFormValues(), title: 'x', project: '  Website  ' }).project).toBe('Website');
  });

  it('trims text and sends an empty start date as null', () => {
    expect(toTaskInput({ ...toFormValues(), title: '  Ship  ', description: ' ', deadline: '2026-10-01' })).toMatchObject({
      title: 'Ship',
      description: '',
      startDate: null,
    });
  });
});

describe('dependency candidates', () => {
  // b depends on a, c depends on b
  const a = makeTask({ _id: 'a' });
  const b = makeTask({ _id: 'b', dependencies: ['a'] });
  const c = makeTask({ _id: 'c', dependencies: ['b'] });
  const d = makeTask({ _id: 'd' });
  const tasks = [a, b, c, d];

  it('finds direct and transitive dependants', () => {
    expect([...getDependentIds('a', tasks)].sort()).toEqual(['b', 'c']);
  });

  it('excludes the task itself and anything that would create a cycle', () => {
    expect(getDependencyCandidates(tasks, 'a').map(t => t._id)).toEqual(['d']);
    expect(getDependencyCandidates(tasks, 'c').map(t => t._id)).toEqual(['a', 'b', 'd']);
  });

  it('offers every task when creating', () => {
    expect(getDependencyCandidates(tasks)).toHaveLength(4);
  });
});
