import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { DEFAULT_FILTERS } from '@/features/tasks';
import { useUrlFilters } from '../hooks/useUrlFilters';

const renderAt = (url: string) =>
  renderHook(
    () => ({ filters: useUrlFilters(), location: useLocation(), navigate: useNavigate() }),
    { wrapper: ({ children }: { children: ReactNode }) => <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter> },
  );

describe('useUrlFilters', () => {
  it('reads the filters from the URL', () => {
    const { result } = renderAt('/w/tasks?view=list&q=bug&status=in-progress&priority=high&assignedToMe=1&sort=deadline');
    expect(result.current.filters[0]).toEqual({
      ...DEFAULT_FILTERS, search: 'bug', status: 'in-progress', priority: 'high', assignedToMe: true, sort: 'deadline',
    });
  });

  it('starts from the defaults and ignores unknown values', () => {
    const { result } = renderAt('/w/tasks?status=done&sort=random');
    expect(result.current.filters[0]).toEqual(DEFAULT_FILTERS);
  });

  it('writes changes to the URL, keeping the other parameters', () => {
    const { result } = renderAt('/w/tasks?view=board&col=completed&qf=bugs&group=type');

    act(() => result.current.filters[1]({ ...DEFAULT_FILTERS, search: 'login', type: 'bug' }));
    expect(result.current.filters[0].search).toBe('login');
    const params = new URLSearchParams(result.current.location.search);
    expect(params.get('q')).toBe('login');
    expect(params.get('type')).toBe('bug');
    expect(params.get('view')).toBe('board');
    expect(params.get('col')).toBe('completed');
    expect(params.get('qf')).toBe('bugs');
    expect(params.get('group')).toBe('type');

    act(() => result.current.filters[1](DEFAULT_FILTERS));
    expect(result.current.location.search).toBe('?view=board&col=completed&qf=bugs&group=type');
  });

  it('follows the URL when it changes by itself (a saved view, a pasted link)', () => {
    const { result } = renderAt('/w/tasks?view=list&q=old');
    expect(result.current.filters[0].search).toBe('old');

    act(() => result.current.navigate('/w/tasks?view=board&status=completed&label=ops'));
    expect(result.current.filters[0]).toEqual({ ...DEFAULT_FILTERS, status: 'completed', label: 'ops' });

    act(() => result.current.navigate('/w/tasks?view=list'));
    expect(result.current.filters[0]).toEqual(DEFAULT_FILTERS);
  });

  it('keeps what was typed across several quick changes', () => {
    const { result } = renderAt('/w/tasks');
    act(() => result.current.filters[1]({ ...DEFAULT_FILTERS, search: 'a' }));
    act(() => result.current.filters[1]({ ...DEFAULT_FILTERS, search: 'ab' }));
    act(() => result.current.filters[1]({ ...DEFAULT_FILTERS, search: 'abc' }));
    expect(result.current.filters[0].search).toBe('abc');
    expect(new URLSearchParams(result.current.location.search).get('q')).toBe('abc');
  });
});
