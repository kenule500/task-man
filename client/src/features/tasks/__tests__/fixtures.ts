import type { Task } from '../types';

let sequence = 0;

/** Builds a task with sensible defaults; override only what a test cares about. */
export const makeTask = (overrides: Partial<Task> = {}): Task => {
  sequence += 1;
  return {
    _id: `task-${sequence}`,
    title: `Task ${sequence}`,
    description: '',
    status: 'pending',
    priority: 'medium',
    startDate: null,
    deadline: '2026-10-10T00:00:00.000Z',
    position: sequence * 1000,
    dependencies: [],
    createdAt: `2026-10-01T00:00:${String(sequence % 60).padStart(2, '0')}.000Z`,
    ...overrides,
  };
};
