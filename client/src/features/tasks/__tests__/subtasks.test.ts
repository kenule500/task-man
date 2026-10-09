import { arrangeWithSubtasks, countSubtasks, getSubtasks, indexSubtasks } from '../lib/subtasks';
import { makeTask } from './fixtures';

describe('subtask helpers', () => {
  const parent = makeTask({ _id: 'p', title: 'Parent' });
  const done = makeTask({ _id: 'a', parent: 'p', status: 'completed', position: 1 });
  const open = makeTask({ _id: 'b', parent: 'p', position: 2 });
  const lone = makeTask({ _id: 'lone', title: 'Lone' });
  const tasks = [parent, lone, open, done];

  it('lists the subtasks of a parent in the order they were added', () => {
    expect(getSubtasks(tasks, 'p').map(task => task._id)).toEqual(['a', 'b']);
    expect(getSubtasks(tasks, 'lone')).toEqual([]);
  });

  it('indexes subtasks by parent', () => {
    const index = indexSubtasks(tasks);
    expect([...index.keys()]).toEqual(['p']);
    expect(index.get('p')).toHaveLength(2);
  });

  it('counts finished subtasks', () => {
    expect(countSubtasks(getSubtasks(tasks, 'p'))).toEqual({ done: 1, total: 2 });
    expect(countSubtasks([])).toEqual({ done: 0, total: 0 });
  });

  it('places each subtask right under its parent', () => {
    const entries = arrangeWithSubtasks(tasks);
    expect(entries.map(entry => [entry.task._id, entry.depth])).toEqual([['p', 0], ['a', 1], ['b', 1], ['lone', 0]]);
  });

  it('keeps a subtask whose parent is filtered out and names the parent', () => {
    const entries = arrangeWithSubtasks([lone, open], tasks);
    expect(entries).toEqual([
      { task: lone, depth: 0 },
      { task: open, depth: 0, orphanOf: 'Parent' },
    ]);
  });
});
