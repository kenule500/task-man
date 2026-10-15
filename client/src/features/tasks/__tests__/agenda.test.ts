import { buildAgenda, buildUpcoming } from '../lib/agenda';
import { makeTask } from './fixtures';

const october = new Date(2026, 9, 1);

describe('buildAgenda', () => {
  it('keeps only days of the visible month that have tasks, in date order', () => {
    const late = makeTask({ deadline: '2026-10-20T00:00:00.000Z' });
    const early = makeTask({ deadline: '2026-10-03T00:00:00.000Z' });
    const otherMonth = makeTask({ deadline: '2026-11-02T00:00:00.000Z' });
    const otherYear = makeTask({ deadline: '2025-10-05T00:00:00.000Z' });

    const agenda = buildAgenda([late, otherMonth, early, otherYear], october);
    expect(agenda.map(day => day.key)).toEqual(['2026-10-03', '2026-10-20']);
  });

  it('groups several tasks under one day and preserves their order', () => {
    const a = makeTask({ deadline: '2026-10-10T00:00:00.000Z' });
    const b = makeTask({ deadline: '2026-10-10T00:00:00.000Z' });

    const [day] = buildAgenda([a, b], october);
    expect(day.tasks.map(task => task._id)).toEqual([a._id, b._id]);
    expect(day.date.getDate()).toBe(10);
  });

  it('flags today', () => {
    const task = makeTask({ deadline: '2026-10-14T00:00:00.000Z' });
    const other = makeTask({ deadline: '2026-10-15T00:00:00.000Z' });

    const agenda = buildAgenda([task, other], october, new Date(2026, 9, 14, 15, 30));
    expect(agenda.map(day => day.isToday)).toEqual([true, false]);
  });

  it('drops days before today in the current month when listing upcoming', () => {
    const past = makeTask({ deadline: '2026-10-03T00:00:00.000Z' });
    const now = makeTask({ deadline: '2026-10-14T00:00:00.000Z' });
    const later = makeTask({ deadline: '2026-10-28T00:00:00.000Z' });
    const today = new Date(2026, 9, 14, 12);

    expect(buildUpcoming([past, now, later], october, today).map(day => day.key)).toEqual(['2026-10-14', '2026-10-28']);
    // other months are listed in full
    expect(buildUpcoming([past, later], new Date(2026, 9, 1), new Date(2026, 10, 5)).map(day => day.key))
      .toEqual(['2026-10-03', '2026-10-28']);
  });

  it('is empty when nothing is due that month', () => {
    expect(buildAgenda([], october)).toEqual([]);
    expect(buildAgenda([makeTask({ deadline: '2026-12-01T00:00:00.000Z' })], october)).toEqual([]);
  });
});
