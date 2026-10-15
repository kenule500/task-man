import { makeTask } from '@/features/tasks/__tests__/fixtures';
import { MY_WORK_LIMIT, bucketOf, buildMyWork } from '../myWorkGroups';

const me = { _id: 'me', name: 'Ada Lovelace' };
const other = { _id: 'other', name: 'Grace Hopper' };
const TODAY = '2026-10-10';
const NOW = new Date('2026-10-10T12:00:00Z');

const mine = (title: string, deadline: string, extra = {}) =>
  makeTask({ title, deadline: `${deadline}T00:00:00.000Z`, assignees: [me], ...extra });

describe('bucketOf', () => {
  it.each([
    ['2026-10-09', 'overdue'],
    ['2026-10-10', 'today'],
    ['2026-10-11', 'week'],
    ['2026-10-17', 'week'],
    ['2026-10-18', 'later'],
  ])('puts %s in %s', (deadline, bucket) => {
    expect(bucketOf(`${deadline}T00:00:00.000Z`, TODAY)).toBe(bucket);
  });
});

describe('buildMyWork', () => {
  it('groups my open tasks by urgency, most urgent first', () => {
    const work = buildMyWork([
      mine('Later', '2026-12-01'),
      mine('Week', '2026-10-13'),
      mine('Today', '2026-10-10'),
      mine('Late', '2026-10-01'),
    ], 'me', { today: TODAY, now: NOW });

    expect(work.groups.map(group => [group.bucket, group.label, group.tasks.map(task => task.title)])).toEqual([
      ['overdue', 'Overdue', ['Late']],
      ['today', 'Due today', ['Today']],
      ['week', 'This week', ['Week']],
      ['later', 'Later', ['Later']],
    ]);
    expect(work.total).toBe(4);
    expect(work.shown).toBe(4);
  });

  it('only counts tasks assigned to me that are not completed', () => {
    const work = buildMyWork([
      mine('Open', '2026-10-12'),
      mine('Done', '2026-10-12', { status: 'completed' }),
      makeTask({ title: 'Theirs', deadline: '2026-10-12T00:00:00.000Z', assignees: [other] }),
      makeTask({ title: 'Unassigned', deadline: '2026-10-12T00:00:00.000Z' }),
    ], 'me', { today: TODAY, now: NOW });
    expect(work.groups.flatMap(group => group.tasks.map(task => task.title))).toEqual(['Open']);
    expect(work.total).toBe(1);
  });

  it('orders a group by deadline, then priority, then title', () => {
    const work = buildMyWork([
      mine('B low', '2026-10-12', { priority: 'low' }),
      mine('A high later', '2026-10-14', { priority: 'high' }),
      mine('C high', '2026-10-12', { priority: 'high' }),
      mine('A high', '2026-10-12', { priority: 'high' }),
    ], 'me', { today: TODAY, now: NOW });
    expect(work.groups[0].tasks.map(task => task.title)).toEqual(['A high', 'C high', 'B low', 'A high later']);
  });

  it('shows at most `limit` rows across the groups, keeping the most urgent, and still counts the rest', () => {
    const tasks = [
      ...Array.from({ length: 6 }, (_, index) => mine(`Late ${index}`, '2026-10-01')),
      ...Array.from({ length: 6 }, (_, index) => mine(`Soon ${index}`, '2026-10-12')),
    ];
    const work = buildMyWork(tasks, 'me', { today: TODAY, now: NOW });

    expect(MY_WORK_LIMIT).toBe(8);
    expect(work.shown).toBe(8);
    expect(work.total).toBe(12);
    expect(work.groups.map(group => [group.bucket, group.tasks.length, group.total])).toEqual([['overdue', 6, 6], ['week', 2, 6]]);
  });

  it('has no groups when nothing is assigned to me', () => {
    const work = buildMyWork([makeTask({ assignees: [other] })], 'me', { today: TODAY, now: NOW });
    expect(work).toEqual({ groups: [], total: 0, shown: 0, completedRecently: 0 });
  });

  it('counts what I completed in the last 7 days', () => {
    const done = (completedAt: string | undefined, assignees = [me]) =>
      makeTask({ status: 'completed', completedAt, assignees });
    const work = buildMyWork([
      done('2026-10-09T08:00:00.000Z'),
      done('2026-10-04T08:00:00.000Z'),
      done('2026-10-01T08:00:00.000Z'),
      done(undefined),
      done('2026-10-09T08:00:00.000Z', [other]),
    ], 'me', { today: TODAY, now: NOW });
    expect(work.completedRecently).toBe(2);
    expect(work.total).toBe(0);
  });
});
