import { buildReleaseNotes, isReleaseOverdue, summarizeProgress } from '../utils/releaseNotes.js';

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe('summarizeProgress', () => {
  it('counts tasks and points per status group', () => {
    const progress = summarizeProgress([
      { status: 'completed', storyPoints: 5 },
      { status: 'completed', storyPoints: null },
      { status: 'in-progress', storyPoints: 3 },
      { status: 'pending', storyPoints: 2 },
    ], { status: 'unreleased', releaseDate: null });
    expect(progress.counts).toEqual({ pending: 1, 'in-progress': 1, completed: 2, total: 4 });
    expect(progress.points).toEqual({ pending: 2, 'in-progress': 3, completed: 5, total: 10 });
    expect(progress.overdue).toBe(false);
  });
});

describe('isReleaseOverdue', () => {
  const now = new Date('2030-03-10T15:00:00.000Z');
  it('is overdue only for an open release whose day has passed', () => {
    expect(isReleaseOverdue({ status: 'unreleased', releaseDate: day('2030-03-09') }, now)).toBe(true);
    expect(isReleaseOverdue({ status: 'unreleased', releaseDate: day('2030-03-10') }, now)).toBe(false);
    expect(isReleaseOverdue({ status: 'released', releaseDate: day('2030-03-01') }, now)).toBe(false);
    expect(isReleaseOverdue({ status: 'unreleased', releaseDate: null }, now)).toBe(false);
  });
});

describe('buildReleaseNotes', () => {
  const tasks = [
    { _id: 'a', number: 12, title: 'Dark mode', type: 'story', status: 'completed' },
    { _id: 'b', number: 9, title: 'Fix   login\nloop', type: 'bug', status: 'completed' },
    { _id: 'c', number: 15, title: 'Not done yet', type: 'story', status: 'pending' },
    { _id: 'd', number: 3, title: 'Evaluate charts', type: 'spike', status: 'completed' },
  ];

  it('groups finished work by type with task keys', () => {
    const { markdown, groups } = buildReleaseNotes(
      { name: 'v1.2.0', description: 'Autumn release', status: 'released', releaseDate: day('2030-03-01'), releasedAt: day('2030-03-02') },
      tasks,
      'WEB',
    );
    expect(groups.map(group => group.heading)).toEqual(['Features', 'Fixes', 'Spikes']);
    expect(markdown).toBe([
      '# v1.2.0',
      '',
      'Released 2030-03-02',
      '',
      'Autumn release',
      '',
      '## Features',
      '',
      '- WEB-12 Dark mode',
      '',
      '## Fixes',
      '',
      '- WEB-9 Fix login loop',
      '',
      '## Spikes',
      '',
      '- WEB-3 Evaluate charts',
      '',
    ].join('\n'));
  });

  it('says so when nothing is finished', () => {
    const { markdown } = buildReleaseNotes({ name: 'v2', status: 'unreleased' }, [tasks[2]], 'WEB');
    expect(markdown).toContain('_No finished work in this release yet._');
  });
});
