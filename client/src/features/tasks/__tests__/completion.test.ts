import type { Task } from '../types';
import { newlyCompleted } from '../lib/completion';

const task = (id: string, status: Task['status']) => ({ _id: id, status }) as Task;

describe('newlyCompleted', () => {
  it('returns tasks that were open and are now completed', () => {
    const before = [task('a', 'pending'), task('b', 'in-progress'), task('c', 'completed')];
    const after = [task('a', 'completed'), task('b', 'in-progress'), task('c', 'completed')];
    expect(newlyCompleted(before, after)).toEqual(['a']);
  });

  it('ignores tasks that are new, already completed or removed', () => {
    const before = [task('a', 'completed')];
    expect(newlyCompleted(before, [task('a', 'completed'), task('z', 'completed')])).toEqual([]);
    expect(newlyCompleted(before, [])).toEqual([]);
  });
});
