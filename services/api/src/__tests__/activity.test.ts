import { diffFields, formatChangeValue } from '../utils/activity.js';
import { taskNumberFromSearch } from '../utils/taskQuery.js';
import { toAuditCsv } from '../controllers/activityController.js';

describe('formatChangeValue', () => {
  it('formats dates, lists and empty values for the log', () => {
    expect(formatChangeValue(new Date('2030-06-15T00:00:00Z'))).toBe('2030-06-15');
    expect(formatChangeValue(['ux', 'design'])).toBe('ux, design');
    expect(formatChangeValue('')).toBeUndefined();
    expect(formatChangeValue(null)).toBeUndefined();
    expect(formatChangeValue(5)).toBe('5');
  });

  it('truncates long values', () => {
    const value = formatChangeValue('x'.repeat(500));
    expect(value).toHaveLength(200);
    expect(value?.endsWith('…')).toBe(true);
  });
});

describe('diffFields', () => {
  it('reports only the listed fields that really changed', () => {
    const before = { title: 'A', status: 'pending', deadline: new Date('2030-01-01'), labels: ['x'], secret: 1 };
    const after = { title: 'A', status: 'completed', deadline: new Date('2030-01-01'), labels: ['x', 'y'], secret: 2 };
    expect(diffFields(before, after, ['title', 'status', 'deadline', 'labels'])).toEqual([
      { field: 'status', from: 'pending', to: 'completed' },
      { field: 'labels', from: 'x', to: 'x, y' },
    ]);
  });
});

describe('taskNumberFromSearch', () => {
  it('reads keys, #numbers and plain numbers', () => {
    expect(taskNumberFromSearch('WEB-12')).toBe(12);
    expect(taskNumberFromSearch('web-7')).toBe(7);
    expect(taskNumberFromSearch('#42')).toBe(42);
    expect(taskNumberFromSearch(' 9 ')).toBe(9);
    expect(taskNumberFromSearch('fix login')).toBeNull();
    expect(taskNumberFromSearch('TOOLONGKEY-1')).toBeNull();
  });
});

describe('toAuditCsv', () => {
  it('quotes every cell, escapes quotes and neutralises formulas', () => {
    const csv = toAuditCsv([{
      createdAt: new Date('2030-01-02T03:04:05Z'),
      action: 'task.updated',
      summary: '=SUM(A1) "quoted"',
      actor: { name: 'Ada' },
      changes: [{ field: 'status', from: 'pending', to: 'completed' }],
      ip: '127.0.0.1',
    }]);
    const [header, row] = csv.split('\r\n');
    expect(header).toBe('"time","actor","action","subject","changes","ip","user_agent"');
    expect(row).toBe('"2030-01-02T03:04:05.000Z","Ada","task.updated","\'=SUM(A1) ""quoted""","status: pending → completed","127.0.0.1",""');
  });
});
