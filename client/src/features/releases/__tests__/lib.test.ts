import { parseNotesMarkdown, splitNoteItem } from '../lib/notesMarkdown';
import {
  NO_RELEASE_VALUE, describeReleaseDue, describeReleaseProgress, formatReleaseDates, groupReleaseTasks, releaseOptionsFor,
  releasePercent, suggestReleaseName, upcomingReleases,
} from '../lib/progress';
import type { Release, ReleaseProgress, ReleaseTask } from '../types';

const totals = (pending: number, inProgress: number, completed: number) => ({
  pending, 'in-progress': inProgress, completed, total: pending + inProgress + completed,
});
const progress = (counts: ReturnType<typeof totals>, points = totals(0, 0, 0)): ReleaseProgress => ({ counts, points, overdue: false });

const release = (overrides: Partial<Release> = {}): Release => ({
  _id: 'r1', project: 'p1', name: 'v1.0.0', status: 'unreleased', progress: progress(totals(0, 0, 0)), ...overrides,
});

describe('release progress', () => {
  it('uses points when estimated, else task counts', () => {
    expect(releasePercent(progress(totals(1, 1, 2), totals(4, 3, 3)))).toBe(30);
    expect(releasePercent(progress(totals(1, 1, 2)))).toBe(50);
    expect(releasePercent(progress(totals(0, 0, 0)))).toBe(0);
  });

  it('describes counts and points', () => {
    expect(describeReleaseProgress(progress(totals(0, 0, 0)))).toBe('No tasks yet');
    expect(describeReleaseProgress(progress(totals(2, 0, 3)))).toBe('3 of 5 tasks');
    expect(describeReleaseProgress(progress(totals(1, 0, 1), totals(8, 0, 5)))).toBe('1 of 2 tasks · 5 of 13 pts');
  });
});

describe('release dates', () => {
  it('formats the available dates', () => {
    expect(formatReleaseDates({})).toBe('No dates set');
    expect(formatReleaseDates({ releaseDate: '2030-03-05T00:00:00.000Z' })).toBe('Due Mar 5, 2030');
    expect(formatReleaseDates({ startDate: '2030-03-01', releaseDate: '2030-03-05' })).toBe('Mar 1 – Mar 5, 2030');
  });

  it('describes the days left of an open release only', () => {
    const today = new Date(2030, 2, 10);
    expect(describeReleaseDue({ status: 'unreleased', releaseDate: '2030-03-09' }, today)).toBe('Overdue by 1 day');
    expect(describeReleaseDue({ status: 'unreleased', releaseDate: '2030-03-10' }, today)).toBe('Due today');
    expect(describeReleaseDue({ status: 'unreleased', releaseDate: '2030-03-15' }, today)).toBe('Due in 5 days');
    expect(describeReleaseDue({ status: 'released', releaseDate: '2030-03-15' }, today)).toBe('');
    expect(describeReleaseDue({ status: 'unreleased', releaseDate: null }, today)).toBe('');
  });
});

describe('release helpers', () => {
  it('suggests the next version name', () => {
    expect(suggestReleaseName([])).toBe('v1.0.0');
    expect(suggestReleaseName([release({ name: 'v1.2.0' }), release({ name: 'v1.10.0' }), release({ name: 'Beta' })])).toBe('v1.11.0');
  });

  it('offers unreleased releases of the project plus the current one', () => {
    const releases = [
      release({ _id: 'a', name: 'v1' }),
      release({ _id: 'b', name: 'v0', status: 'released' }),
      release({ _id: 'c', name: 'other', project: 'p2' }),
    ];
    expect(releaseOptionsFor(releases, 'p1').map(option => option.value)).toEqual([NO_RELEASE_VALUE, 'a']);
    expect(releaseOptionsFor(releases, 'p1', 'b')).toEqual([
      { value: NO_RELEASE_VALUE, label: 'No release' },
      { value: 'a', label: 'v1' },
      { value: 'b', label: 'v0 (released)' },
    ]);
  });

  it('orders upcoming releases by date, undated last', () => {
    const list = [
      release({ _id: 'a', name: 'b', releaseDate: null }),
      release({ _id: 'b', name: 'c', releaseDate: '2030-02-01' }),
      release({ _id: 'c', name: 'a', releaseDate: '2030-01-01' }),
      release({ _id: 'd', name: 'x', status: 'archived' }),
    ];
    expect(upcomingReleases(list, 'p1').map(item => item._id)).toEqual(['c', 'b', 'a']);
  });

  it('groups tasks by status group', () => {
    const task = (id: string, status: ReleaseTask['status']): ReleaseTask => ({
      _id: id, key: id, title: id, status, type: 'task', priority: 'medium', deadline: '2030-01-01',
    });
    const groups = groupReleaseTasks([task('a', 'completed'), task('b', 'pending'), task('c', 'completed')]);
    expect(groups.map(group => [group.label, group.tasks.length])).toEqual([['To do', 1], ['Done', 2]]);
  });
});

describe('parseNotesMarkdown', () => {
  it('reads headings, lists and paragraphs as data', () => {
    const blocks = parseNotesMarkdown('# v1.2.0\n\nReleased 2030-03-02\n\n## Features\n\n- WEB-12 Dark mode\n- WEB-9 Fix <b>login</b>\n\n_No finished work in this release yet._\n');
    expect(blocks).toEqual([
      { kind: 'heading', level: 1, text: 'v1.2.0' },
      { kind: 'paragraph', text: 'Released 2030-03-02', muted: false },
      { kind: 'heading', level: 2, text: 'Features' },
      { kind: 'list', items: ['WEB-12 Dark mode', 'WEB-9 Fix <b>login</b>'] },
      { kind: 'paragraph', text: 'No finished work in this release yet.', muted: true },
    ]);
  });

  it('joins wrapped paragraph lines and splits task keys', () => {
    expect(parseNotesMarkdown('first line\nsecond line')).toEqual([{ kind: 'paragraph', text: 'first line second line', muted: false }]);
    expect(splitNoteItem('WEB-12 Dark mode')).toEqual({ key: 'WEB-12', title: 'Dark mode' });
    expect(splitNoteItem('Plain title')).toEqual({ key: '', title: 'Plain title' });
  });
});
