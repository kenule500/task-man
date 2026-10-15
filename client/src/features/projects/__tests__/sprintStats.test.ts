import { makeTask } from '@/features/tasks/__tests__/fixtures';
import {
  daysUntilEnd, describeDaysLeft, describeProgress, formatSprintRange, isSprintLate, suggestSprintDates, suggestSprintName,
  workProgress,
} from '../lib/sprintStats';
import { makeSprint } from './fixtures';

const today = new Date(2026, 9, 10); // 10 Oct 2026

describe('workProgress', () => {
  it('uses story points when tasks are estimated', () => {
    const progress = workProgress([
      makeTask({ storyPoints: 5, status: 'completed' }),
      makeTask({ storyPoints: 3 }),
      makeTask({ storyPoints: 2 }),
    ]);
    expect(progress).toMatchObject({ totalPoints: 10, donePoints: 5, percent: 50, unit: 'points', totalTasks: 3, doneTasks: 1 });
    expect(describeProgress(progress)).toBe('5 of 10 points');
  });

  it('falls back to counting tasks when nothing is estimated', () => {
    const progress = workProgress([makeTask({ status: 'completed' }), makeTask(), makeTask(), makeTask()]);
    expect(progress).toMatchObject({ percent: 25, unit: 'tasks' });
    expect(describeProgress(progress)).toBe('1 of 4 tasks');
  });

  it('ignores subtasks and handles an empty list', () => {
    const parent = makeTask({ storyPoints: 3 });
    const child = makeTask({ parent: parent._id, storyPoints: 8, status: 'completed' });
    expect(workProgress([parent, child]).totalPoints).toBe(3);
    expect(workProgress([]).percent).toBe(0);
  });
});

describe('sprint dates', () => {
  it('counts the days left and words them', () => {
    expect(daysUntilEnd(makeSprint({ endDate: '2026-10-15T00:00:00.000Z' }), today)).toBe(5);
    expect(describeDaysLeft({ endDate: '2026-10-15' }, today)).toBe('5 days left');
    expect(describeDaysLeft({ endDate: '2026-10-11' }, today)).toBe('1 day left');
    expect(describeDaysLeft({ endDate: '2026-10-10' }, today)).toBe('Ends today');
    expect(describeDaysLeft({ endDate: '2026-10-09' }, today)).toBe('Ended 1 day ago');
    expect(describeDaysLeft({ endDate: '2026-10-07' }, today)).toBe('Ended 3 days ago');
  });

  it('flags only an active sprint past its end as late', () => {
    expect(isSprintLate({ status: 'active', endDate: '2026-10-09' }, today)).toBe(true);
    expect(isSprintLate({ status: 'active', endDate: '2026-10-10' }, today)).toBe(false);
    expect(isSprintLate({ status: 'completed', endDate: '2026-10-01' }, today)).toBe(false);
  });

  it('formats the range with the year once', () => {
    expect(formatSprintRange({ startDate: '2026-10-01T00:00:00.000Z', endDate: '2026-10-14T00:00:00.000Z' })).toBe('Oct 1 – Oct 14, 2026');
  });
});

describe('sprint suggestions', () => {
  it('starts a first sprint today and lasts two weeks', () => {
    expect(suggestSprintDates([], today)).toEqual({ startDate: '2026-10-10', endDate: '2026-10-23' });
  });

  it('starts after the latest sprint', () => {
    const later = makeSprint({ endDate: '2026-10-20T00:00:00.000Z' });
    expect(suggestSprintDates([later], today)).toEqual({ startDate: '2026-10-21', endDate: '2026-11-03' });
  });

  it('never suggests a start in the past', () => {
    const old = makeSprint({ endDate: '2026-09-01T00:00:00.000Z' });
    expect(suggestSprintDates([old], today).startDate).toBe('2026-10-10');
  });

  it('numbers the next sprint', () => {
    expect(suggestSprintName([makeSprint(), makeSprint()])).toBe('Sprint 3');
  });
});
