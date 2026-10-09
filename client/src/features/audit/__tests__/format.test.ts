import {
  actionMeta, describeEntry, describeRange, describeUserAgent, entryLink, formatChange, groupByDay, summarizeChanges,
} from '../lib/format';
import { hasActiveFilters, parseAuditFilters, withAuditFilters } from '../lib/filters';
import type { AuditEntry } from '../types';

const entry = (overrides: Partial<AuditEntry>): AuditEntry => ({
  _id: 'e1',
  action: 'task.updated',
  summary: '',
  actor: { _id: 'u1', name: 'Ada' },
  changes: [],
  createdAt: '2026-10-09T12:00:00.000Z',
  ...overrides,
});

describe('describeEntry', () => {
  it('names the old and the new role of a member', () => {
    expect(describeEntry(entry({
      action: 'member.role_changed', summary: 'Sam', changes: [{ field: 'role', from: 'Developer', to: 'Scrum Master' }],
    }))).toBe('Ada changed the role of Sam from Developer to Scrum Master');
  });

  it('states the completed points of a sprint', () => {
    const base = { action: 'sprint.completed', summary: 'Sprint 2' };
    expect(describeEntry(entry({ ...base, changes: [{ field: 'completedPoints', to: '19' }] }))).toBe('Ada completed Sprint 2 (19 points)');
    expect(describeEntry(entry({ ...base, changes: [{ field: 'completedPoints', to: '1' }] }))).toBe('Ada completed Sprint 2 (1 point)');
    expect(describeEntry(entry(base))).toBe('Ada completed Sprint 2');
  });

  it('describes an export and falls back for a removed account', () => {
    expect(describeEntry(entry({ action: 'audit.exported', summary: '12 entries' }))).toBe('Ada exported the audit log (12 entries)');
    expect(describeEntry(entry({ action: 'audit.exported', actor: null }))).toBe('A removed user exported the audit log');
  });

  it('turns a single task change into a sentence and several into a list of fields', () => {
    expect(describeEntry(entry({ summary: 'Fix login', changes: [{ field: 'status', from: 'Pending', to: 'In Progress' }] })))
      .toBe('Ada changed the status of "Fix login" from Pending to In Progress');
    expect(describeEntry(entry({ summary: 'Fix login', changes: [{ field: 'deadline', to: '2026-10-20' }] })))
      .toBe('Ada set the due date of "Fix login" to 2026-10-20');
    expect(describeEntry(entry({ summary: 'Fix login', changes: [{ field: 'storyPoints', from: '3' }] })))
      .toBe('Ada cleared the story points of "Fix login"');
    expect(describeEntry(entry({ summary: 'Fix login', changes: [{ field: 'status' }, { field: 'priority' }] })))
      .toBe('Ada updated status, priority of "Fix login"');
    expect(describeEntry(entry({ summary: 'Fix login', changes: [{ field: 'sprint', to: 's1' }] })))
      .toBe('Ada moved "Fix login" to another sprint');
  });

  it('covers the other areas', () => {
    expect(describeEntry(entry({ action: 'task.created', summary: 'Child', changes: [{ field: 'parent', to: 't1' }] }))).toBe('Ada created subtask "Child"');
    expect(describeEntry(entry({ action: 'task.attachment_added', summary: 'Plan', changes: [{ field: 'file', to: 'plan.pdf' }] })))
      .toBe('Ada attached plan.pdf to "Plan"');
    expect(describeEntry(entry({ action: 'sprint.created', summary: 'Sprint 3 · Web' }))).toBe('Ada created Sprint 3 in Web');
    expect(describeEntry(entry({ action: 'invitation.sent', summary: 'sam@x.io', changes: [{ field: 'role', to: 'Viewer' }] })))
      .toBe('Ada invited sam@x.io as Viewer');
    expect(describeEntry(entry({ action: 'workspace.updated', changes: [{ field: 'name', from: 'Old', to: 'New' }] })))
      .toBe('Ada renamed the workspace from Old to New');
    expect(describeEntry(entry({ action: 'member.removed', summary: 'Sam' }))).toBe('Ada removed Sam from the workspace');
    expect(describeEntry(entry({ action: 'something.new', summary: 'X' }))).toBe('Ada something new "X"');
  });
});

describe('changes', () => {
  it('formats one change and caps a list', () => {
    expect(formatChange({ field: 'status', from: 'Pending', to: 'In progress' })).toBe('status: Pending → In progress');
    expect(formatChange({ field: 'startDate', to: '2026-10-01' })).toBe('start date: 2026-10-01');
    expect(formatChange({ field: 'labels', from: 'a' })).toBe('labels: a → none');
    expect(summarizeChanges([])).toBe('');
    expect(summarizeChanges([{ field: 'a', from: '1', to: '2' }, { field: 'b', from: '1', to: '2' }, { field: 'c', from: '1', to: '2' }]))
      .toBe('a: 1 → 2; b: 1 → 2; +1 more');
  });
});

describe('actionMeta', () => {
  it('knows every server action and still labels an unknown one', () => {
    expect(actionMeta('member.role_changed').label).toBe('Role changed');
    expect(actionMeta('billing.plan_changed').label).toBe('Billing plan changed');
  });
});

describe('groupByDay', () => {
  const at = (day: number, hour: number) => new Date(2026, 9, day, hour, 0).toISOString();

  it('groups by local day, keeps order and labels today and yesterday', () => {
    const now = new Date(2026, 9, 9, 15, 0);
    const groups = groupByDay([
      entry({ _id: 'a', createdAt: at(9, 14) }),
      entry({ _id: 'b', createdAt: at(9, 9) }),
      entry({ _id: 'c', createdAt: at(8, 20) }),
      entry({ _id: 'd', createdAt: at(2, 11) }),
    ], now);

    expect(groups.map(group => group.entries.map(item => item._id))).toEqual([['a', 'b'], ['c'], ['d']]);
    expect(groups.map(group => group.key)).toEqual(['2026-10-09', '2026-10-08', '2026-10-02']);
    expect(groups[0].label).toBe('Today');
    expect(groups[1].label).toBe('Yesterday');
    expect(groups[2].label).toBe('Friday, 2 October 2026');
  });

  it('describes the range of a page', () => {
    expect(describeRange([])).toBe('');
    expect(describeRange([entry({ createdAt: at(9, 14) }), entry({ createdAt: at(2, 11) })])).toBe('from 2 Oct 2026, 11:00 to 9 Oct 2026, 14:00');
  });
});

describe('where and links', () => {
  it('reads browser and system from a user agent', () => {
    expect(describeUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36')).toBe('Chrome on Windows');
    expect(describeUserAgent('curl/8.0')).toBe('curl/8.0');
    expect(describeUserAgent(undefined)).toBe('');
  });

  it('links to the task or project unless it was deleted', () => {
    expect(entryLink('demo', entry({ task: 't1' }))).toEqual({ href: '/demo/tasks?task=t1', label: 'Open task' });
    expect(entryLink('demo', entry({ action: 'sprint.started', project: 'p1', sprint: 's1' }))?.href).toBe('/demo/projects/p1');
    expect(entryLink('demo', entry({ action: 'task.deleted', task: 't1' }))).toBeNull();
    expect(entryLink('demo', entry({ action: 'member.removed' }))).toBeNull();
  });
});

describe('filters in the URL', () => {
  it('parses known areas only and round-trips', () => {
    expect(parseAuditFilters(new URLSearchParams('area=task&actor=u1'))).toEqual({ area: 'task', actor: 'u1' });
    expect(parseAuditFilters(new URLSearchParams('area=nope'))).toEqual({ area: '', actor: '' });

    const next = withAuditFilters(new URLSearchParams('keep=1&area=task'), { area: '', actor: 'u2' });
    expect(next.toString()).toBe('keep=1&actor=u2');
    expect(hasActiveFilters({ area: '', actor: '' })).toBe(false);
    expect(hasActiveFilters({ area: 'sprint', actor: '' })).toBe(true);
  });
});
