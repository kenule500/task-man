import {
  describeView, editableViews, groupViews, isViewActive, normalizeSavedQuery, savedQueryFromParams, viewHref,
} from '../lib/viewQuery';
import type { SavedView } from '../types';

const make = (overrides: Partial<SavedView> = {}): SavedView => ({
  _id: 'v1', name: 'View', view: 'list', query: '', shared: false, mine: true, owner: { _id: 'u1', name: 'Ada' }, ...overrides,
});

describe('savedQueryFromParams', () => {
  it('keeps filters, quick filters and grouping', () => {
    expect(savedQueryFromParams(new URLSearchParams('status=pending&assignedToMe=1&qf=bugs,mine&group=assignee')))
      .toBe('status=pending&assignedToMe=1&qf=mine%2Cbugs&group=assignee');
  });

  it('leaves out navigation state and defaults', () => {
    expect(savedQueryFromParams(new URLSearchParams('view=board&task=t1&new=1&col=completed&sort=createdAt&status=all'))).toBe('');
  });

  it('drops unknown values', () => {
    expect(savedQueryFromParams(new URLSearchParams('status=done&priority=high&qf=nope&group=sprint'))).toBe('priority=high');
  });

  it('keeps the release and custom field filters, sorted, and drops invalid ones', () => {
    expect(savedQueryFromParams(new URLSearchParams('release=r1&cf.size=sm01&cf.blocked=true&view=list'))).toBe('release=r1&cf.blocked=true&cf.size=sm01');
    expect(savedQueryFromParams(new URLSearchParams('cf.Size=1&cf.a-b=2&release=a%20b'))).toBe('');
    expect(viewHref('acme', make({ view: 'list', query: 'release=none&cf.size=none' }))).toBe('/acme/tasks?view=list&release=none&cf.size=none');
  });

  it('keeps the project and sprint scope', () => {
    expect(savedQueryFromParams(new URLSearchParams('view=board&project=Web+app&sprint=active&task=t1'))).toBe('project=Web+app&sprint=active');
    expect(viewHref('acme', make({ view: 'board', query: 'project=Web&sprint=backlog' }))).toBe('/acme/tasks?view=board&project=Web&sprint=backlog');
  });

  it('normalises a stored query', () => {
    expect(normalizeSavedQuery('type=bug&evil=1&q=a b')).toBe('q=a+b&type=bug');
  });
});

describe('viewHref', () => {
  it('opens the layout with its filters', () => {
    expect(viewHref('acme', make({ view: 'board', query: 'status=pending&assignedToMe=1' })))
      .toBe('/acme/tasks?view=board&status=pending&assignedToMe=1');
  });

  it('works for a view without filters', () => {
    expect(viewHref('acme', make({ view: 'calendar' }))).toBe('/acme/tasks?view=calendar');
  });
});

describe('isViewActive', () => {
  const view = make({ view: 'board', query: 'priority=high' });

  it('matches the same layout and filters, whatever else is in the URL', () => {
    expect(isViewActive(view, 'board', new URLSearchParams('view=board&priority=high&col=completed'))).toBe(true);
  });

  it('does not match another layout or other filters', () => {
    expect(isViewActive(view, 'list', new URLSearchParams('priority=high'))).toBe(false);
    expect(isViewActive(view, 'board', new URLSearchParams('priority=low'))).toBe(false);
    expect(isViewActive(view, 'board', new URLSearchParams(''))).toBe(false);
  });
});

describe('listing', () => {
  const mine = make({ _id: 'a', name: 'zeta', mine: true });
  const mineShared = make({ _id: 'b', name: 'Alpha', mine: true, shared: true });
  const theirs = make({ _id: 'c', name: 'Beta', mine: false, shared: true, owner: { _id: 'u2', name: 'Grace' } });
  const hidden = make({ _id: 'd', name: 'Hidden', mine: false, shared: false });

  it('groups mine and shared-by-others, sorted by name', () => {
    const { mine: own, shared } = groupViews([mine, mineShared, theirs, hidden]);
    expect(own.map(view => view._id)).toEqual(['b', 'a']);
    expect(shared.map(view => view._id)).toEqual(['c']);
  });

  it('lets admins edit shared views too', () => {
    expect(editableViews([mine, theirs, hidden], false).map(view => view._id)).toEqual(['a']);
    expect(editableViews([mine, theirs, hidden], true).map(view => view._id)).toEqual(['c', 'a']);
  });
});

describe('describeView', () => {
  it('summarises the layout and filters', () => {
    expect(describeView(make({ view: 'board', query: 'status=pending&assignedToMe=1&q=login' })))
      .toBe('Board · “login” · status pending · assigned to me');
    expect(describeView(make())).toBe('List');
    expect(describeView(make({ query: 'release=none&cf.size=a' }))).toBe('List · no release · field filter');
    expect(describeView(make({ query: 'release=r1&cf.size=a&cf.blocked=true' }))).toBe('List · release · 2 field filters');
    expect(describeView(make({ view: 'board', query: 'project=Web&sprint=active' }))).toBe('Board · project Web · active sprint');
  });
});
