import { makeTask } from '@/features/tasks/__tests__/fixtures';
import { makeProject, makeSprint } from '@/features/projects/__tests__/fixtures';
import {
  MIN_BAR_PX, buildAxis, buildRoadmap, describeEpic, formatSpan, placeSpan, sprintBands,
} from '../lib/roadmap';

const TODAY = new Date(2026, 9, 10);

const website = makeProject({ _id: 'p-web', name: 'Website' });
const app = makeProject({ _id: 'p-app', name: 'App' });
const legacy = makeProject({ _id: 'p-old', name: 'Legacy', archived: true });
const projects = [website, app, legacy];

const epic = (overrides: Parameters<typeof makeTask>[0]) => makeTask({ type: 'epic', ...overrides });

describe('buildRoadmap', () => {
  const checkout = epic({ _id: 'e-checkout', title: 'Checkout', project: 'Website', startDate: '2026-10-05', deadline: '2026-10-20' });
  const tasks = [
    checkout,
    makeTask({ epic: 'e-checkout', status: 'completed', storyPoints: 3, startDate: '2026-09-28', deadline: '2026-10-02' }),
    makeTask({ epic: 'e-checkout', storyPoints: 5, deadline: '2026-11-10' }),
  ];

  it('rolls an epic up to the earliest start and latest due date of its items, with progress by points', () => {
    const [group] = buildRoadmap(tasks, projects, { today: TODAY });
    expect(group).toMatchObject({ id: 'p-web', name: 'Website' });
    expect(group.epics[0]).toMatchObject({
      id: 'e-checkout', start: '2026-09-28', end: '2026-11-10', percent: 38, unit: 'points', items: 2, doneItems: 1, health: 'in-progress',
    });
  });

  it('uses the epic own dates when it has no items and marks a future epic as upcoming', () => {
    const later = epic({ title: 'Later', project: 'App', startDate: '2026-12-01', deadline: '2026-12-31' });
    const [group] = buildRoadmap([later], projects, { today: TODAY });
    expect(group.epics[0]).toMatchObject({ start: '2026-12-01', end: '2026-12-31', percent: 0, items: 0, health: 'upcoming' });
  });

  it('flags unfinished epics past their end as overdue and fully done epics as done', () => {
    const late = epic({ _id: 'e-late', title: 'Late', project: 'Website', deadline: '2026-09-01' });
    const done = epic({ _id: 'e-done', title: 'Done', project: 'Website', deadline: '2026-09-15' });
    const group = buildRoadmap([
      late, makeTask({ epic: 'e-late', deadline: '2026-09-01' }),
      done, makeTask({ epic: 'e-done', status: 'completed', deadline: '2026-09-15' }),
    ], projects, { today: TODAY })[0];
    expect(group.epics.map(row => [row.title, row.health])).toEqual([['Late', 'overdue'], ['Done', 'done']]);
  });

  it('groups by project in project order, hides archived projects and keeps epics without a project last', () => {
    const groups = buildRoadmap([
      epic({ title: 'App epic', project: 'App' }),
      epic({ title: 'Old epic', project: 'Legacy' }),
      epic({ title: 'Loose epic', project: '' }),
      epic({ title: 'Web epic', project: 'website' }),
    ], projects, { today: TODAY });
    expect(groups.map(group => [group.name, group.epics.map(row => row.title)])).toEqual([
      ['Website', ['Web epic']], ['App', ['App epic']], ['No project', ['Loose epic']],
    ]);
  });

  it('filters to one project and ignores subtasks and non-epics', () => {
    const groups = buildRoadmap([
      epic({ title: 'App epic', project: 'App' }),
      epic({ title: 'Web epic', project: 'Website' }),
      makeTask({ title: 'A story', project: 'Website' }),
    ], projects, { projectId: 'p-app', today: TODAY });
    expect(groups).toHaveLength(1);
    expect(groups[0].epics.map(row => row.title)).toEqual(['App epic']);
  });

  it('sorts the epics of a project by start date, then title', () => {
    const [group] = buildRoadmap([
      epic({ title: 'B', project: 'App', startDate: '2026-11-01', deadline: '2026-11-05' }),
      epic({ title: 'A', project: 'App', startDate: '2026-11-01', deadline: '2026-11-09' }),
      epic({ title: 'C', project: 'App', startDate: '2026-10-01', deadline: '2026-10-09' }),
    ], projects, { today: TODAY });
    expect(group.epics.map(row => row.title)).toEqual(['C', 'A', 'B']);
  });
});

describe('buildAxis', () => {
  const spans = [{ start: '2026-09-28', end: '2026-11-10' }];

  it('snaps months zoom to whole months with a tick per month and a today offset', () => {
    const axis = buildAxis(spans, 'months', TODAY);
    expect(axis.start).toEqual(new Date(2026, 8, 1));
    expect(axis.end).toEqual(new Date(2026, 10, 30));
    expect(axis.days).toBe(91);
    expect(axis.width).toBe(91 * axis.dayPx);
    expect(axis.ticks.map(tick => tick.label)).toEqual(['Sep 2026', 'Oct 2026', 'Nov 2026']);
    expect(axis.ticks[1]).toMatchObject({ left: 30 * axis.dayPx, width: 31 * axis.dayPx });
    expect(axis.todayLeft).toBe(39 * axis.dayPx + axis.dayPx / 2);
  });

  it('snaps weeks zoom to Monday-Sunday weeks with a tick per week', () => {
    const axis = buildAxis(spans, 'weeks', TODAY);
    expect(axis.start.getDay()).toBe(1);
    expect(axis.end.getDay()).toBe(0);
    expect(axis.days % 7).toBe(0);
    expect(axis.ticks).toHaveLength(axis.days / 7);
    expect(axis.ticks[0].width).toBe(7 * axis.dayPx);
  });

  it('is at least about a quarter wide and still shows today without any spans', () => {
    const months = buildAxis([], 'months', TODAY);
    expect(months.ticks.length).toBeGreaterThanOrEqual(3);
    expect(months.todayLeft).not.toBeNull();
    expect(buildAxis([], 'weeks', TODAY).days).toBeGreaterThanOrEqual(56);
  });

  it('widens to include a span far from today', () => {
    const axis = buildAxis([{ start: '2027-03-01', end: '2027-03-15' }], 'months', TODAY);
    expect(axis.end.getFullYear()).toBe(2027);
    expect(axis.ticks.at(-1)?.label).toBe('Mar 2027');
  });
});

describe('placeSpan and sprintBands', () => {
  const axis = buildAxis([{ start: '2026-09-28', end: '2026-11-10' }], 'months', TODAY);

  it('places a bar by whole days from the axis start', () => {
    expect(placeSpan({ start: '2026-10-01', end: '2026-10-14' }, axis)).toEqual({ left: 30 * axis.dayPx, width: 14 * axis.dayPx });
  });

  it('keeps a one-day bar wide enough to click', () => {
    expect(placeSpan({ start: '2026-10-01', end: '2026-10-01' }, axis).width).toBe(MIN_BAR_PX);
  });

  it('turns sprints into header bands in start order', () => {
    const second = makeSprint({ _id: 's2', name: 'Sprint 2', startDate: '2026-10-15T00:00:00.000Z', endDate: '2026-10-28T00:00:00.000Z' });
    const first = makeSprint({ _id: 's1', name: 'Sprint 1', status: 'active', startDate: '2026-10-01T00:00:00.000Z', endDate: '2026-10-14T00:00:00.000Z' });
    const bands = sprintBands([second, first], axis);
    expect(bands.map(band => [band.id, band.status])).toEqual([['s1', 'active'], ['s2', 'planned']]);
    expect(bands[0]).toMatchObject({ left: 30 * axis.dayPx, width: 14 * axis.dayPx });
  });
});

describe('text helpers', () => {
  it('formats a span with the year once when both ends share it', () => {
    expect(formatSpan('2026-10-03', '2026-11-12')).toBe('Oct 3 – Nov 12, 2026');
    expect(formatSpan('2026-12-20', '2027-01-10')).toBe('Dec 20, 2026 – Jan 10, 2027');
    expect(formatSpan('2026-10-03', '2026-10-03')).toBe('Oct 3, 2026');
  });

  it('describes an epic bar for screen readers', () => {
    const [group] = buildRoadmap([
      epic({ _id: 'e1', title: 'Checkout', project: 'Website', startDate: '2026-10-05', deadline: '2026-10-20' }),
      makeTask({ epic: 'e1', status: 'completed', storyPoints: 3, deadline: '2026-10-20' }),
      makeTask({ epic: 'e1', storyPoints: 5, deadline: '2026-10-20' }),
    ], projects, { today: TODAY });
    expect(describeEpic(group.epics[0])).toBe('Checkout, Oct 5 – Oct 20, 2026, 38% complete, 1 of 2 items done, 3 of 8 points, in progress');
  });
});
