import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { useBoardUrlState } from '../hooks/useBoardSettings';

const renderAt = (url: string) =>
  renderHook(
    () => ({ board: useBoardUrlState(), location: useLocation(), navigate: useNavigate() }),
    { wrapper: ({ children }: { children: ReactNode }) => <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter> },
  );

describe('useBoardUrlState', () => {
  it('reads the column, quick filters and grouping from the URL', () => {
    const { result } = renderAt('/w/tasks?view=board&col=in-progress&qf=bugs,mine,nope&group=assignee');
    expect(result.current.board.column).toBe('in-progress');
    expect(result.current.board.quickFilters).toEqual(['mine', 'bugs']);
    expect(result.current.board.groupBy).toBe('assignee');
  });

  it('defaults to Pending, no filters and no grouping, ignoring junk values', () => {
    const { result } = renderAt('/w/tasks?view=board&col=archived&group=sprint');
    expect(result.current.board.column).toBe('pending');
    expect(result.current.board.quickFilters).toEqual([]);
    expect(result.current.board.groupBy).toBe('none');
  });

  it('writes the column as a history entry, so Back returns to the previous column', () => {
    const { result } = renderAt('/w/tasks?view=board');

    act(() => result.current.board.setColumn('in-progress'));
    expect(result.current.location.search).toBe('?view=board&col=in-progress');
    act(() => result.current.board.setColumn('completed'));
    expect(result.current.location.search).toBe('?view=board&col=completed');

    act(() => result.current.navigate(-1));
    expect(result.current.location.search).toBe('?view=board&col=in-progress');
    expect(result.current.board.column).toBe('in-progress');
  });

  it('drops the param for the default column and keeps the other params', () => {
    const { result } = renderAt('/w/tasks?view=board&col=completed&qf=bugs');
    act(() => result.current.board.setColumn('pending'));
    expect(result.current.location.search).toBe('?view=board&qf=bugs');
  });

  it('writes quick filters and grouping without adding history entries', () => {
    const { result } = renderAt('/w/tasks?view=board');

    act(() => result.current.board.setQuickFilters(['bugs', 'mine']));
    expect(result.current.location.search).toBe('?view=board&qf=mine%2Cbugs');
    act(() => result.current.board.setGroupBy('type'));
    expect(result.current.location.search).toContain('group=type');
    act(() => result.current.board.setQuickFilters([]));
    act(() => result.current.board.setGroupBy('none'));
    expect(result.current.location.search).toBe('?view=board');

  });
});
