import type { Project, Sprint } from '../types';

let sequence = 0;

/** Builds a sprint with sensible defaults; override only what a test cares about. */
export const makeSprint = (overrides: Partial<Sprint> = {}): Sprint => {
  sequence += 1;
  return {
    _id: `sprint-${sequence}`,
    project: 'project-1',
    name: `Sprint ${sequence}`,
    goal: '',
    startDate: '2026-10-01T00:00:00.000Z',
    endDate: '2026-10-14T00:00:00.000Z',
    status: 'planned',
    ...overrides,
  };
};

/** Builds a project with sensible defaults; override only what a test cares about. */
export const makeProject = (overrides: Partial<Project> = {}): Project => {
  sequence += 1;
  return {
    _id: `project-${sequence}`,
    name: `Project ${sequence}`,
    key: `P${sequence}`,
    description: '',
    color: 'blue',
    icon: 'folder',
    archived: false,
    sprints: [],
    ...overrides,
  };
};
