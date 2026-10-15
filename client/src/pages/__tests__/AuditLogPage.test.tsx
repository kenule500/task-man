import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { auditApi, downloadBlob } from '@/features/audit/api';
import { workspaceApi } from '@/features/workspace/api';
import type { AuditEntry, AuditPage } from '@/features/audit';
import AuditLogPage from '../AuditLogPage';

jest.setTimeout(30000);

jest.mock('@/features/audit/api', () => ({
  auditApi: { list: jest.fn(), exportCsv: jest.fn() },
  downloadBlob: jest.fn(),
}));

jest.mock('@/features/workspace/api', () => ({
  workspaceApi: { members: jest.fn() },
}));

jest.mock('@/utils/api', () => ({
  __esModule: true,
  default: {},
  getApiErrorMessage: (_err: unknown, fallback: string) => fallback,
}));

let granted: string[] = [];
jest.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ can: (permission: string) => granted.includes(permission), user: null, loading: false }),
}));

const audit = auditApi as jest.Mocked<typeof auditApi>;
const members = workspaceApi as jest.Mocked<typeof workspaceApi>;

const entry = (overrides: Partial<AuditEntry>): AuditEntry => ({
  _id: 'e1',
  action: 'member.role_changed',
  summary: 'Sam',
  actor: { _id: 'u1', name: 'Ada' },
  changes: [{ field: 'role', from: 'Developer', to: 'Scrum Master' }],
  ip: '203.0.113.7',
  userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/120.0 Safari/537.36',
  createdAt: new Date(2024, 9, 9, 14, 3).toISOString(),
  ...overrides,
});

const roleChange = entry({});
const sprintDone = entry({
  _id: 'e2', action: 'sprint.completed', summary: 'Sprint 2', project: 'p1', sprint: 's1',
  changes: [{ field: 'completedPoints', to: '19' }], createdAt: new Date(2024, 9, 8, 10, 0).toISOString(),
});
const statusChange = entry({
  _id: 'e3', action: 'task.updated', summary: 'Fix login', task: 't1', actor: { _id: 'u2', name: 'Sam' },
  changes: [{ field: 'status', from: 'Pending', to: 'In Progress' }], createdAt: new Date(2024, 9, 2, 9, 10).toISOString(),
});

const page = (items: AuditEntry[], nextBefore: string | null = null): AuditPage => ({ items, nextBefore, retentionDays: 365, areas: [] });

const Where = () => {
  const location = useLocation();
  return <p data-testid="where">{`${location.pathname}${location.search}`}</p>;
};

const renderPage = (url = '/demo/settings/audit') =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <Where />
      <Routes>
        <Route path="/:workspaceSlug/settings/audit" element={<AuditLogPage />} />
      </Routes>
    </MemoryRouter>,
  );

const stubPhone = (matches: boolean) => {
  window.matchMedia = jest.fn().mockReturnValue({ matches, addEventListener: jest.fn(), removeEventListener: jest.fn() }) as unknown as typeof window.matchMedia;
};

const originalMatchMedia = window.matchMedia;

beforeEach(() => {
  jest.clearAllMocks();
  granted = ['settings:manage'];
  audit.list.mockResolvedValue(page([roleChange, sprintDone]));
  members.members.mockResolvedValue([
    { _id: 'u1', name: 'Ada', email: 'a@x.io', avatarUrl: '', jobTitle: '', role: 'owner', joinedAt: '' },
    { _id: 'u2', name: 'Sam', email: 's@x.io', avatarUrl: '', jobTitle: '', role: 'member', joinedAt: '' },
  ]);
});

afterEach(() => {
  window.matchMedia = originalMatchMedia;
});

describe('AuditLogPage', () => {
  it('shows one heading, the retention and a table with who, what, when and where', async () => {
    renderPage();

    expect(screen.getByRole('heading', { level: 1, name: 'Audit log' })).toBeInTheDocument();
    expect(screen.getByText(/Entries are kept for 365 days\./)).toBeInTheDocument();

    const table = await screen.findByRole('table');
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(3);
    expect(within(rows[1]).getByText('Ada')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Role changed')).toBeInTheDocument();
    expect(within(rows[1]).getByText('role: Developer → Scrum Master')).toBeInTheDocument();
    expect(within(rows[1]).getByText('203.0.113.7')).toBeInTheDocument();
    expect(within(rows[1]).getByText('9 Oct 2024, 14:03')).toBeInTheDocument();
    expect(audit.list).toHaveBeenCalledWith('demo', { area: '', actor: '' }, undefined);
  });

  it('opens the detail sheet with all fields and a link to the task', async () => {
    audit.list.mockResolvedValue(page([statusChange]));
    renderPage();

    await userEvent.click(await screen.findByText('Fix login'));

    const sheet = await screen.findByRole('dialog');
    expect(within(sheet).getByText('Sam changed the status of "Fix login" from Pending to In Progress')).toBeInTheDocument();
    expect(within(sheet).getByText('Chrome on Windows')).toBeInTheDocument();
    expect(within(sheet).getByText('203.0.113.7')).toBeInTheDocument();
    expect(within(sheet).getByText('Pending')).toBeInTheDocument();
    expect(within(sheet).getByText('In Progress')).toBeInTheDocument();
    expect(within(sheet).getByRole('link', { name: 'Open task' })).toHaveAttribute('href', '/demo/tasks?task=t1');
  });

  it('keeps the filters in the URL and reloads from the newest entries', async () => {
    renderPage();
    await screen.findByRole('table');

    await userEvent.click(screen.getByRole('button', { name: 'Sprints' }));

    expect(screen.getByTestId('where')).toHaveTextContent('/demo/settings/audit?area=sprint');
    await waitFor(() => expect(audit.list).toHaveBeenLastCalledWith('demo', { area: 'sprint', actor: '' }, undefined));
    expect(screen.getByRole('button', { name: 'Sprints' })).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(screen.getByTestId('where')).toHaveTextContent(/^\/demo\/settings\/audit$/);
  });

  it('starts from filters in the URL', async () => {
    renderPage('/demo/settings/audit?area=member&actor=u2');

    await waitFor(() => expect(audit.list).toHaveBeenCalledWith('demo', { area: 'member', actor: 'u2' }, undefined));
    expect(await screen.findByRole('button', { name: 'Clear filters' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Members' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('walks to older entries with the cursor and back to newer ones', async () => {
    audit.list
      .mockResolvedValueOnce(page([roleChange], '2026-10-09T12:03:00.000Z'))
      .mockResolvedValueOnce(page([statusChange]))
      .mockResolvedValueOnce(page([roleChange], '2026-10-09T12:03:00.000Z'));
    renderPage();

    const newerButton = await screen.findByRole('button', { name: 'Newer' });
    expect(newerButton).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: 'Older' }));
    expect(await screen.findByText('Fix login')).toBeInTheDocument();
    expect(audit.list).toHaveBeenLastCalledWith('demo', { area: '', actor: '' }, '2026-10-09T12:03:00.000Z');
    expect(screen.getByRole('button', { name: 'Older' })).toBeDisabled();
    expect(screen.getByText(/Showing entries from 2 Oct 2024, 09:10 to 2 Oct 2024, 09:10/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Newer' }));
    expect(await screen.findByText('Sam')).toBeInTheDocument();
    expect(audit.list).toHaveBeenLastCalledWith('demo', { area: '', actor: '' }, undefined);
  });

  it('exports the CSV for the current filters', async () => {
    const blob = new Blob(['a,b'], { type: 'text/csv' });
    audit.exportCsv.mockResolvedValue(blob);
    renderPage('/demo/settings/audit?area=task');
    await screen.findByRole('table');

    await userEvent.click(screen.getByRole('button', { name: 'Export CSV' }));

    await waitFor(() => expect(downloadBlob).toHaveBeenCalledWith(blob, expect.stringMatching(/^audit-demo-\d{4}-\d{2}-\d{2}\.csv$/)));
    expect(audit.exportCsv).toHaveBeenCalledWith('demo', { area: 'task', actor: '' });
  });

  it('explains an empty result and offers to clear the filters', async () => {
    audit.list.mockResolvedValue(page([]));
    renderPage('/demo/settings/audit?area=sprint');

    expect(await screen.findByText('No entries match these filters')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Clear filters' }).length).toBeGreaterThan(0);
  });

  it('shows an error with a retry', async () => {
    audit.list.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(page([roleChange]));
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent('We could not load the audit log.');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('table')).toBeInTheDocument();
  });

  it('turns into a list grouped by day on phones, with the detail in a sheet', async () => {
    stubPhone(true);
    renderPage();

    expect(await screen.findByRole('heading', { level: 2, name: 'Wednesday, 9 October 2024' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Tuesday, 8 October 2024' })).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Ada completed Sprint 2 \(19 points\)/ }));
    const sheet = await screen.findByRole('dialog');
    expect(within(sheet).getByRole('link', { name: 'Open sprint project' })).toHaveAttribute('href', '/demo/projects/p1');
  });

  it('hides the log from people who cannot manage settings', () => {
    granted = [];
    renderPage();

    expect(screen.getByText('Only people who manage settings can see the audit log')).toBeInTheDocument();
    expect(audit.list).not.toHaveBeenCalled();
  });
});
