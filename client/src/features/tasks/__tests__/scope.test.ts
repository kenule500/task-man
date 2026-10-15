import { DEFAULT_FILTERS } from '../lib/filters';
import { NO_SPRINT, hasScope, orderSprints, resolveScopeFilters, scopeHref, scopeProjectOf, scopeSprintOf, type ScopeProject } from '../lib/scope';

const sprint = (id: string, status: 'planned' | 'active' | 'completed', startDate: string, project = 'p1') =>
  ({ _id: id, project, name: `Sprint ${id}`, status, startDate, endDate: startDate });

const web: ScopeProject = {
  _id: 'p1', name: 'Web',
  sprints: [sprint('s1', 'completed', '2026-08-01'), sprint('s2', 'active', '2026-09-01'), sprint('s3', 'planned', '2026-10-01')],
};
const mobile: ScopeProject = { _id: 'p2', name: 'Mobile', sprints: [sprint('m1', 'planned', '2026-10-01', 'p2')] };
const projects = [web, mobile];

describe('scope helpers', () => {
  it('finds the project by name, or by the sprint id alone', () => {
    expect(scopeProjectOf({ project: ' web ', sprint: 'all' }, projects)).toBe(web);
    expect(scopeProjectOf({ project: 'all', sprint: 'm1' }, projects)).toBe(mobile);
    expect(scopeProjectOf({ project: 'Ghost', sprint: 'm1' }, projects)).toBeUndefined();
    expect(scopeProjectOf({ project: 'all', sprint: 'active' }, projects)).toBeUndefined();
  });

  it('finds the sprint, including the running one of the project', () => {
    expect(scopeSprintOf({ project: 'Web', sprint: 'active' }, projects)?._id).toBe('s2');
    expect(scopeSprintOf({ project: 'Mobile', sprint: 'active' }, projects)).toBeUndefined();
    expect(scopeSprintOf({ project: 'all', sprint: 's3' }, projects)?._id).toBe('s3');
    expect(scopeSprintOf({ project: 'all', sprint: 'backlog' }, projects)).toBeUndefined();
  });

  it('resolves "active" to the ids of running sprints', () => {
    expect(resolveScopeFilters({ ...DEFAULT_FILTERS, project: 'Web', sprint: 'active' }, projects).sprint).toBe('s2');
    expect(resolveScopeFilters({ ...DEFAULT_FILTERS, project: 'Mobile', sprint: 'active' }, projects).sprint).toBe(NO_SPRINT);
    expect(resolveScopeFilters({ ...DEFAULT_FILTERS, sprint: 'active' }, projects).sprint).toBe('s2');
    const plain = { ...DEFAULT_FILTERS, sprint: 'backlog' };
    expect(resolveScopeFilters(plain, projects)).toBe(plain);
  });

  it('knows when a scope is set', () => {
    expect(hasScope(DEFAULT_FILTERS)).toBe(false);
    expect(hasScope({ project: 'Web', sprint: 'all' })).toBe(true);
    expect(hasScope({ project: 'all', sprint: 'backlog' })).toBe(true);
  });

  it('orders sprints active, planned, then completed', () => {
    expect(orderSprints(web.sprints).map(item => item._id)).toEqual(['s2', 's3', 's1']);
  });

  it('builds the tasks URL', () => {
    expect(scopeHref('acme', { view: 'board', project: 'Web & Co', sprint: 's2' })).toBe('/acme/tasks?view=board&project=Web+%26+Co&sprint=s2');
    expect(scopeHref('acme', { view: 'list', sprint: 'backlog' })).toBe('/acme/tasks?view=list&sprint=backlog');
  });
});
