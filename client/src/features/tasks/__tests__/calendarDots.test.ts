import { DOT_META, MAX_DOTS, dotStateOf, summarizeDay } from '../lib/calendarDots';
import { makeTask } from './fixtures';

const TODAY = '2026-10-15';
const past = '2026-10-10T00:00:00.000Z';
const future = '2026-10-20T00:00:00.000Z';

describe('dotStateOf', () => {
  it('flags unfinished tasks due before today as overdue', () => {
    expect(dotStateOf(makeTask({ status: 'pending', deadline: past }), TODAY)).toBe('overdue');
    expect(dotStateOf(makeTask({ status: 'in-progress', deadline: past }), TODAY)).toBe('overdue');
  });

  it('keeps completed tasks completed even when past due', () => {
    expect(dotStateOf(makeTask({ status: 'completed', deadline: past }), TODAY)).toBe('completed');
  });

  it('treats tasks due today or later by their status', () => {
    expect(dotStateOf(makeTask({ status: 'pending', deadline: '2026-10-15T00:00:00.000Z' }), TODAY)).toBe('pending');
    expect(dotStateOf(makeTask({ status: 'in-progress', deadline: future }), TODAY)).toBe('in-progress');
  });
});

describe('summarizeDay', () => {
  it('returns nothing for an empty day', () => {
    expect(summarizeDay([], TODAY)).toMatchObject({ dots: [], overflow: 0, total: 0, summary: '' });
  });

  it('orders dots overdue, pending, in progress, completed with the state colors', () => {
    const tasks = [
      makeTask({ status: 'completed', deadline: future }),
      makeTask({ status: 'in-progress', deadline: future }),
      makeTask({ status: 'pending', deadline: future }),
    ];
    const { dots, overflow } = summarizeDay(tasks, TODAY);
    expect(dots.map(dot => dot.state)).toEqual(['pending', 'in-progress', 'completed']);
    expect(dots.map(dot => dot.className)).toEqual(['bg-slate-400', 'bg-blue-600', 'bg-emerald-500']);
    expect(overflow).toBe(0);
  });

  it('shows overdue first in red-600', () => {
    const { dots } = summarizeDay([makeTask({ status: 'completed', deadline: past }), makeTask({ status: 'pending', deadline: past })], TODAY);
    expect(dots[0]).toEqual({ state: 'overdue', className: 'bg-red-600' });
    expect(dots[1].state).toBe('completed');
  });

  it('caps the dots at three and counts the rest as overflow', () => {
    const tasks = Array.from({ length: 6 }, () => makeTask({ status: 'in-progress', deadline: future }));
    const result = summarizeDay(tasks, TODAY);
    expect(result.dots).toHaveLength(MAX_DOTS);
    expect(result.overflow).toBe(3);
    expect(result.total).toBe(6);
  });

  it('keeps the most urgent states when capping', () => {
    const tasks = [
      ...Array.from({ length: 3 }, () => makeTask({ status: 'completed', deadline: future })),
      makeTask({ status: 'pending', deadline: past }),
    ];
    const { dots, overflow } = summarizeDay(tasks, TODAY);
    expect(dots.map(dot => dot.state)).toEqual(['overdue', 'completed', 'completed']);
    expect(overflow).toBe(1);
  });

  it('writes an accessible summary in dot order, skipping empty states', () => {
    const tasks = [
      makeTask({ status: 'in-progress', deadline: future }),
      makeTask({ status: 'in-progress', deadline: future }),
      makeTask({ status: 'completed', deadline: future }),
      makeTask({ status: 'pending', deadline: past }),
    ];
    const { summary, counts } = summarizeDay(tasks, TODAY);
    expect(summary).toBe('1 overdue, 2 in progress, 1 completed');
    expect(counts).toEqual({ overdue: 1, pending: 0, 'in-progress': 2, completed: 1 });
  });
});

describe('DOT_META', () => {
  it('reuses the status dot colors', () => {
    expect(DOT_META.pending.dot).toBe('bg-slate-400');
    expect(DOT_META['in-progress'].dot).toBe('bg-blue-600');
    expect(DOT_META.completed.dot).toBe('bg-emerald-500');
    expect(DOT_META.overdue.dot).toBe('bg-red-600');
  });
});
