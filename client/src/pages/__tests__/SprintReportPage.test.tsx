import { render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { planningApi } from '@/features/planning/api';
import { item, makeReport, total } from '@/features/planning/__tests__/fixtures';
import SprintReportPage from '../SprintReportPage';

jest.setTimeout(30000);

jest.mock('@/components/AppShell', () => ({
  __esModule: true,
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

jest.mock('@/features/planning/api', () => ({
  planningApi: { sprintReport: jest.fn() },
}));

const api = planningApi as jest.Mocked<typeof planningApi>;
const ana = { _id: 'u-ana', name: 'Ana Diaz' };

const report = makeReport({
  summary: {
    committed: total(2, 6), completed: total(2, 8), notCompleted: total(1, 3), added: total(1, 5), removed: total(1, 2),
  },
  committed: [item({ _id: 'c1' }), item({ _id: 'c2' })],
  completed: [
    item({ _id: 'c1', number: 12, title: 'Cart page', status: 'completed', storyPoints: 3, assignees: [ana], completedAt: '2026-10-03T10:00:00.000Z' }),
    item({ _id: 'a1', number: 15, title: 'Late request', type: 'bug', status: 'completed', storyPoints: 5, completedAt: '2026-10-06T10:00:00.000Z' }),
  ],
  notCompleted: [item({ _id: 'n1', number: 13, title: 'Receipts', storyPoints: 3 })],
  added: [item({ _id: 'a1', number: 15, title: 'Late request', type: 'bug', status: 'completed', storyPoints: 5 })],
  removed: [item({ _id: 'r1', number: 14, title: 'Wishlist', storyPoints: null })],
});

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/demo/projects/p1/sprints/s1/report']}>
      <Routes>
        <Route path="/:workspaceSlug/projects/:projectId/sprints/:sprintId/report" element={<SprintReportPage />} />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => {
  api.sprintReport.mockResolvedValue(report);
});

describe('SprintReportPage', () => {
  it('loads the report of the sprint named in the URL', async () => {
    renderPage();
    expect(await screen.findByRole('heading', { level: 1, name: 'Sprint 7 report' })).toBeInTheDocument();
    expect(api.sprintReport).toHaveBeenCalledWith('demo', 'p1', 's1');
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('shows the sprint header with status, dates, goal and a way back', async () => {
    renderPage();
    await screen.findByRole('heading', { level: 1, name: 'Sprint 7 report' });

    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Goal:')).toBeInTheDocument();
    expect(screen.getByText(/Ship checkout/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to project' })).toHaveAttribute('href', '/demo/projects/p1');
    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(within(crumbs).getByRole('link', { name: 'Website' })).toHaveAttribute('href', '/demo/projects/p1');
    expect(within(crumbs).getByText('Report')).toHaveAttribute('aria-current', 'page');
  });

  it('summarises committed, completed, not completed, added and removed work in points and items', async () => {
    renderPage();
    const summary = await screen.findByRole('region', { name: 'Summary' });

    expect(within(summary).getByText('6 pts')).toBeInTheDocument();
    expect(within(summary).getByText('2 items at the start')).toBeInTheDocument();
    expect(within(summary).getByText('8 pts')).toBeInTheDocument();
    expect(within(summary).getByText('2 items · 73% delivered')).toBeInTheDocument();
    expect(within(summary).getByText('3 pts')).toBeInTheDocument();
    expect(within(summary).getByText('5 pts')).toBeInTheDocument();
    expect(within(summary).getByText('2 pts')).toBeInTheDocument();
  });

  it('draws the burndown as one labelled image', async () => {
    renderPage();
    expect(await screen.findByRole('img', { name: /^Sprint 7 burndown\. Burndown chart:/ })).toBeInTheDocument();
  });

  it('lists each group of work in a table with key, title, type, points and assignee', async () => {
    renderPage();
    const completed = await screen.findByRole('table', { name: 'Completed' });

    const cart = within(completed).getByRole('row', { name: /WEB-12/ });
    expect(within(cart).getByRole('link', { name: 'Cart page' })).toHaveAttribute('href', '/demo/tasks?task=c1');
    expect(within(cart).getByText('Story')).toBeInTheDocument();
    expect(within(cart).getByText('Ana Diaz')).toBeInTheDocument();
    expect(within(cart).getByRole('cell', { name: '3' })).toBeInTheDocument();
    expect(within(within(completed).getByRole('row', { name: /WEB-15/ })).getByText('Bug')).toBeInTheDocument();

    expect(within(screen.getByRole('table', { name: 'Not completed' })).getByText('Receipts')).toBeInTheDocument();
    expect(within(screen.getByRole('table', { name: 'Added after start' })).getByText('Late request')).toBeInTheDocument();
    const removed = screen.getByRole('table', { name: 'Removed' });
    expect(within(removed).getByText('Wishlist')).toBeInTheDocument();
    expect(within(removed).getByText('Not estimated')).toBeInTheDocument();
    expect(within(removed).getByText('Unassigned')).toBeInTheDocument();
  });

  it('says so when a list is empty and when the sprint has not started', async () => {
    api.sprintReport.mockResolvedValue(makeReport({
      sprint: { ...report.sprint, status: 'planned', startedAt: null },
      summary: { committed: total(0, 0), completed: total(0, 0), notCompleted: total(0, 0), added: total(0, 0), removed: total(0, 0) },
    }));
    renderPage();

    expect(await screen.findByText('Planned')).toBeInTheDocument();
    expect(screen.getByText('The burndown appears once the sprint has started and has tasks.')).toBeInTheDocument();
    expect(screen.getByText('No work was removed from the sprint.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('notes the recording limit on completed sprints', async () => {
    api.sprintReport.mockResolvedValue(makeReport({ sprint: { ...report.sprint, status: 'completed', completedAt: '2026-10-14T10:00:00.000Z' } }));
    renderPage();
    expect(await screen.findByText(/may be missing from Not completed/)).toBeInTheDocument();
  });

  it('explains a failed load with what to do next', async () => {
    api.sprintReport.mockRejectedValue(new Error('offline'));
    renderPage();

    expect(await screen.findByRole('heading', { name: 'We could not load this report' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/Check your connection/);
    expect(screen.getByRole('heading', { level: 1, hidden: true, name: 'Sprint report' })).toBeInTheDocument();
  });
});
