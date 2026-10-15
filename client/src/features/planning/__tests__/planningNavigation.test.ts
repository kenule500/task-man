import { buildCommandItems } from '@/components/commandSearch';

describe('planning pages in the command palette', () => {
  it('offers Roadmap and Workload to people who can read projects', () => {
    const pages = buildCommandItems('acme', permission => permission === 'projects:read').filter(item => item.group === 'Pages');
    expect(pages.map(item => [item.label, item.href])).toEqual(expect.arrayContaining([
      ['Roadmap', '/acme/roadmap'],
      ['Workload', '/acme/workload'],
    ]));
  });

  it('hides them without projects:read', () => {
    const labels = buildCommandItems('acme', () => false).map(item => item.label);
    expect(labels).not.toContain('Roadmap');
    expect(labels).not.toContain('Workload');
  });
});
