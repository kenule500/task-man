import { getDependencyCandidates, getDependentIds } from '../lib/dependencies';
import { toFormValues, toTaskInput, validateTaskForm } from '../lib/taskForm';
import { makeTask } from './fixtures';

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
