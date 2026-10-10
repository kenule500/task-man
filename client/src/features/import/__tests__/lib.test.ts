import { makeProject } from '@/features/projects/__tests__/fixtures';
import {
  buildCommitMapping, hasMappingProblems, initialMapping, mappingProblems, peopleSummary, projectNameFromFile, stageForGroup,
} from '../lib/mapping';
import { checkImportFile, formatBytes } from '../lib/sources';
import { CSV_TEMPLATE_HEADERS, csvTemplate } from '../lib/template';
import type { ImportPreview } from '../types';

const preview = (overrides: Partial<ImportPreview> = {}): ImportPreview => ({
  source: 'jira',
  total: 4,
  limit: 2000,
  skipped: 0,
  columns: ['To Do', 'Done'],
  statuses: [
    { name: 'To Do', count: 3, suggested: 'pending' },
    { name: 'Done', count: 1, suggested: 'completed' },
  ],
  types: [{ name: 'Bug', count: 1, suggested: 'bug' }, { name: 'Epic', count: 1, suggested: 'epic' }],
  people: [
    { identifier: 'Dan Developer', count: 2, isMember: true, memberId: 'm1', memberName: 'Dan Developer' },
    { identifier: 'Zed', count: 1, isMember: false, memberId: null, memberName: null },
  ],
  labels: [{ name: 'ux', count: 1 }],
  sprints: [{ name: 'Sprint 1', count: 2 }],
  withParent: 1,
  withEpic: 1,
  comments: 2,
  members: [{ id: 'm1', name: 'Dan Developer' }],
  stages: [
    { key: 'todo', name: 'To do', group: 'pending' },
    { key: 'review', name: 'In review', group: 'in-progress' },
    { key: 'done', name: 'Done', group: 'completed' },
  ],
  items: [],
  warnings: [],
  ...overrides,
});

describe('checkImportFile', () => {
  it('accepts a file of the right kind and size', () => {
    expect(checkImportFile({ name: 'board.JSON', size: 1200 }, 'trello')).toBeNull();
    expect(checkImportFile({ name: 'issues.csv', size: 1200 }, 'jira')).toBeNull();
    expect(checkImportFile({ name: 'tasks.tsv', size: 1200 }, 'csv')).toBeNull();
  });

  it('explains what is wrong', () => {
    expect(checkImportFile({ name: 'a.csv', size: 0 }, 'csv')).toMatch(/empty/);
    expect(checkImportFile({ name: 'a.csv', size: 2_500_000 }, 'csv')).toMatch(/2 MB/);
    expect(checkImportFile({ name: 'board.csv', size: 100 }, 'trello')).toMatch(/\.json/);
  });

  it('formats sizes', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1500)).toBe('1.5 KB');
    expect(formatBytes(2_300_000)).toBe('2.3 MB');
  });
});

describe('csvTemplate', () => {
  it('has the documented header row and parseable example rows', () => {
    const lines = csvTemplate().trimEnd().split('\r\n');
    expect(lines[0]).toBe(CSV_TEMPLATE_HEADERS.join(','));
    expect(CSV_TEMPLATE_HEADERS).toEqual([
      'title', 'description', 'status', 'priority', 'type', 'labels', 'assignee_email', 'due_date', 'start_date',
      'story_points', 'parent_id', 'id',
    ]);
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain('"design,ux"');
  });
});

describe('initialMapping', () => {
  it('maps statuses to the first stage of the suggested group, people to matched members and types to suggestions', () => {
    const draft = initialMapping(preview(), { canCreateProject: true, projects: [], suggestedName: 'Backlog' });
    expect(draft.statusMap).toEqual({ 'To Do': 'todo', Done: 'done' });
    expect(draft.userMap).toEqual({ 'Dan Developer': 'm1', Zed: null });
    expect(draft.typeMap).toEqual({ Bug: 'bug', Epic: 'epic' });
    expect(draft).toMatchObject({ mode: 'new', newName: 'Backlog', newKey: 'BAC', createSprints: true, includeComments: true });
  });

  it('starts with an existing project when the person cannot create projects', () => {
    const projects = [makeProject({ name: 'Archived', archived: true }), makeProject({ name: 'Web' })];
    expect(initialMapping(preview(), { canCreateProject: false, projects })).toMatchObject({ mode: 'existing', existingProject: 'Web' });
  });

  it('finds the stage of a group', () => {
    expect(stageForGroup(preview().stages, 'in-progress')).toBe('review');
    expect(stageForGroup([], 'completed')).toBe('completed');
  });
});

describe('mappingProblems', () => {
  const projects = [makeProject({ name: 'Web' }), makeProject({ name: 'Old', archived: true })];
  const base = initialMapping(preview(), { canCreateProject: true, projects });

  it('needs a real, open project', () => {
    expect(mappingProblems({ ...base, mode: 'existing', existingProject: 'Web' }, { canCreateProject: true, projects })).toEqual({});
    expect(hasMappingProblems(mappingProblems({ ...base, mode: 'existing', existingProject: 'Old' }, { canCreateProject: true, projects }))).toBe(true);
    expect(hasMappingProblems(mappingProblems({ ...base, mode: 'existing', existingProject: '' }, { canCreateProject: true, projects }))).toBe(true);
  });

  it('checks a new project name and key', () => {
    const options = { canCreateProject: true, projects };
    expect(mappingProblems({ ...base, mode: 'new', newName: 'Fresh', newKey: 'FR' }, options)).toEqual({});
    expect(mappingProblems({ ...base, mode: 'new', newName: '  ', newKey: '' }, options).project).toMatch(/name/);
    expect(mappingProblems({ ...base, mode: 'new', newName: 'web', newKey: '' }, options).project).toMatch(/already exists/);
    expect(mappingProblems({ ...base, mode: 'new', newName: 'Fresh', newKey: 'X' }, options).key).toMatch(/2 to 6/);
    expect(mappingProblems({ ...base, mode: 'new', newName: 'Fresh', newKey: 'FR' }, { canCreateProject: false, projects }).project).toMatch(/existing/);
  });
});

describe('commit body and summaries', () => {
  it('builds the request mapping for an existing and a new project', () => {
    const base = initialMapping(preview(), { canCreateProject: true, projects: [] });
    expect(buildCommitMapping({ ...base, mode: 'existing', existingProject: 'Web' }).project).toBe('Web');
    expect(buildCommitMapping({ ...base, mode: 'new', newName: ' Fresh ', newKey: 'FR' }).project).toEqual({ name: 'Fresh', key: 'FR' });
    expect(buildCommitMapping({ ...base, mode: 'new', newName: 'Fresh', newKey: '' }).project).toEqual({ name: 'Fresh' });
    expect(buildCommitMapping(base)).toMatchObject({ statusMap: base.statusMap, userMap: base.userMap, createSprints: true });
  });

  it('names a project after the file and counts mapped people', () => {
    expect(projectNameFromFile('backlog_export-2030.csv')).toBe('Backlog export 2030');
    expect(projectNameFromFile('.json')).toBe('');
    const data = preview();
    const draft = initialMapping(data, { canCreateProject: true, projects: [] });
    expect(peopleSummary(data, draft)).toEqual({ mapped: 1, unassigned: 1 });
  });
});
