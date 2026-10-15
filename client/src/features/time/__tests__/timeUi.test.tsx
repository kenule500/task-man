import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { PermissionContext } from '@/context/PermissionContext';
import type { PermissionContextValue } from '@/context/permissionTypes';
import { TimeBadge } from '@/features/tasks';
import { timeApi } from '../api';
import TaskTimeSection from '../components/TaskTimeSection';
import TimerPill from '../components/TimerPill';
import { resetTimerStore } from '../timerStore';
import type { RunningTimer, TaskTime, TimeEntry } from '../types';

jest.setTimeout(30000);

jest.mock('../api', () => ({
  getApiErrorMessage: (_error: unknown, fallback: string) => fallback,
  timeApi: {
    forTask: jest.fn(),
    log: jest.fn(),
    remove: jest.fn(),
    start: jest.fn(),
    stop: jest.fn(),
    running: jest.fn(),
    timesheet: jest.fn(),
    exportCsv: jest.fn(),
  },
}));

const api = timeApi as jest.Mocked<typeof timeApi>;

const permissions = (granted: string[]): PermissionContextValue => ({
  user: null,
  workspace: null,
  role: null,
  permissions: granted,
  actions: [],
  loading: false,
  error: null,
  can: permission => granted.includes(permission),
  hasRole: () => false,
  refresh: async () => undefined,
});

const entry = (overrides: Partial<TimeEntry> = {}): TimeEntry => ({
  _id: 'e1',
  task: 't1',
  user: { _id: 'u1', name: 'Ada Lovelace' },
  startedAt: '2026-10-05T09:00:00.000Z',
  endedAt: '2026-10-05T10:30:00.000Z',
  minutes: 90,
  note: 'Pairing on the parser',
  running: false,
  createdAt: '2026-10-05T10:30:00.000Z',
  ...overrides,
});

const taskTime = (overrides: Partial<TaskTime> = {}): TaskTime => ({
  estimateMinutes: 120,
  loggedMinutes: 90,
  running: null,
  entries: [entry(), entry({ _id: 'e2', user: { _id: 'u2', name: 'Grace Hopper' }, minutes: 30, note: '' })],
  ...overrides,
});

const runningTimer: RunningTimer = {
  _id: 'r1',
  startedAt: new Date(Date.now() - 65_000).toISOString(),
  task: { _id: 't1', title: 'Fix login bug', key: 'WEB-12' },
};

const withPermissions = (granted: string[], children: React.ReactNode) => (
  <MemoryRouter>
    <PermissionContext.Provider value={permissions(granted)}>{children}</PermissionContext.Provider>
  </MemoryRouter>
);

const renderSection = (granted = ['tasks:read', 'tasks:write'], onEstimateChange = jest.fn().mockResolvedValue(undefined)) => {
  const view = render(withPermissions(granted, (
    <TaskTimeSection
      workspaceSlug="acme"
      taskId="t1"
      estimateMinutes={120}
      currentUserId="u1"
      canWrite={granted.includes('tasks:write')}
      canEditEstimate
      onEstimateChange={onEstimateChange}
    />
  )));
  return { onEstimateChange, ...view };
};

beforeEach(() => {
  resetTimerStore();
  api.forTask.mockResolvedValue(taskTime());
  api.running.mockResolvedValue(null);
});

describe('TimeBadge', () => {
  it('stays hidden without logged time or an estimate', () => {
    const { container } = render(<TimeBadge logged={0} estimate={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows logged against the estimate and flags going over it in words', () => {
    const { rerender } = render(<TimeBadge logged={90} estimate={120} />);
    expect(screen.getByText('1h 30m / 2h')).toBeInTheDocument();
    expect(screen.queryByText(/over the estimate/)).not.toBeInTheDocument();
    rerender(<TimeBadge logged={150} estimate={120} />);
    expect(screen.getByText(/over the estimate/)).toBeInTheDocument();
  });

  it('shows the estimate alone and logged time alone', () => {
    const { rerender } = render(<TimeBadge logged={0} estimate={90} />);
    expect(screen.getByText('Est. 1h 30m')).toBeInTheDocument();
    rerender(<TimeBadge logged={45} estimate={null} />);
    expect(screen.getByText('45m')).toBeInTheDocument();
  });
});

describe('TaskTimeSection', () => {
  it('shows progress against the estimate and the entries', async () => {
    renderSection();
    expect(await screen.findByRole('list', { name: 'Time entries' })).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Logged time against the estimate' })).toHaveAttribute('aria-valuenow', '75');
    expect(screen.getByText('1h 30m of 2h (30m left)')).toBeInTheDocument();
    expect(screen.getByText('Pairing on the parser')).toBeInTheDocument();
    expect(screen.getByText('Grace Hopper')).toBeInTheDocument();
  });

  it('says so when the estimate is exceeded', async () => {
    api.forTask.mockResolvedValue(taskTime({ loggedMinutes: 195 }));
    renderSection();
    expect(await screen.findByText('3h 15m of 2h (1h 15m over)')).toBeInTheDocument();
  });

  it('lets people delete their own entries and not other people\'s without settings:manage', async () => {
    api.remove.mockResolvedValue({ loggedMinutes: 30 });
    renderSection();
    await screen.findByRole('list', { name: 'Time entries' });
    expect(screen.queryByRole('button', { name: /Delete 30m entry by Grace Hopper/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Delete 1h 30m entry by Ada Lovelace/ }));
    await waitFor(() => expect(api.remove).toHaveBeenCalledWith('acme', 't1', 'e1'));
  });

  it('lets a manager delete anyone\'s entry', async () => {
    renderSection(['tasks:read', 'tasks:write', 'settings:manage']);
    await screen.findByRole('list', { name: 'Time entries' });
    expect(screen.getByRole('button', { name: /Delete 30m entry by Grace Hopper/ })).toBeInTheDocument();
  });

  it('saves an estimate typed as "3h 15m" and clears it when emptied', async () => {
    const { onEstimateChange } = renderSection();
    const box = await screen.findByRole('textbox', { name: 'Estimate' });
    expect(box).toHaveValue('2h');
    await userEvent.clear(box);
    await userEvent.type(box, '3h 15m{Enter}');
    await waitFor(() => expect(onEstimateChange).toHaveBeenCalledWith(195));
    await userEvent.clear(box);
    await userEvent.tab();
    await waitFor(() => expect(onEstimateChange).toHaveBeenCalledWith(null));
  });

  it('rejects an estimate that is not a duration', async () => {
    const { onEstimateChange } = renderSection();
    const box = await screen.findByRole('textbox', { name: 'Estimate' });
    await userEvent.clear(box);
    await userEvent.type(box, 'soon{Enter}');
    expect(await screen.findByText('Enter a duration such as 2h 30m, 45m or 1:30.')).toBeInTheDocument();
    expect(box).toHaveAttribute('aria-invalid', 'true');
    expect(onEstimateChange).not.toHaveBeenCalled();
  });

  it('starts a timer from the button', async () => {
    api.start.mockResolvedValue({ entry: entry({ running: true, endedAt: null, minutes: 0 }), stopped: null });
    api.running.mockResolvedValueOnce(null).mockResolvedValue(runningTimer);
    renderSection();
    await userEvent.click(await screen.findByRole('button', { name: 'Start timer' }));
    expect(api.start).toHaveBeenCalledWith('acme', 't1');
    expect(await screen.findByRole('button', { name: /Stop timer/ })).toBeInTheDocument();
  });

  it('hides the write actions from a read-only role', async () => {
    renderSection(['tasks:read']);
    await screen.findByRole('list', { name: 'Time entries' });
    expect(screen.queryByRole('button', { name: 'Start timer' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Log time' })).not.toBeInTheDocument();
  });

  it('validates the duration before logging time, then sends minutes and the note', async () => {
    api.log.mockResolvedValue({ entry: entry(), loggedMinutes: 135 });
    renderSection();
    await userEvent.click(await screen.findByRole('button', { name: 'Log time' }));
    const dialog = await screen.findByRole('dialog', { name: 'Log time' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Log time' }));
    expect(await within(dialog).findByText('Enter a duration such as 1h 30m, 45m or 1:30.')).toBeInTheDocument();
    expect(api.log).not.toHaveBeenCalled();

    await userEvent.type(within(dialog).getByLabelText(/Time spent/), '45m');
    await userEvent.type(within(dialog).getByLabelText('Note'), 'Review');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Log time' }));
    await waitFor(() => expect(api.log).toHaveBeenCalledWith('acme', 't1', { minutes: 45, note: 'Review' }));
  });
});

describe('TimerPill', () => {
  it('renders nothing without a running timer', async () => {
    const { container } = render(withPermissions(['tasks:read', 'tasks:write'], <TimerPill slug="acme" />));
    await waitFor(() => expect(api.running).toHaveBeenCalled());
    expect(container.querySelector('a')).toBeNull();
  });

  it('shows the task key and elapsed time, links to the task and stops the timer', async () => {
    api.running.mockResolvedValue(runningTimer);
    api.stop.mockResolvedValue({ entry: entry(), loggedMinutes: 91 });
    render(withPermissions(['tasks:read', 'tasks:write'], <TimerPill slug="acme" />));

    const link = await screen.findByRole('link', { name: /Timer running on WEB-12/ });
    expect(link).toHaveAttribute('href', '/acme/tasks?task=t1');
    expect(link).toHaveTextContent('WEB-12');
    expect(link).toHaveTextContent(/1:0\d/);

    api.running.mockResolvedValue(null);
    await userEvent.click(screen.getByRole('button', { name: 'Stop the timer on WEB-12' }));
    await waitFor(() => expect(api.stop).toHaveBeenCalledWith('acme', 't1'));
    await waitFor(() => expect(screen.queryByRole('link', { name: /Timer running/ })).not.toBeInTheDocument());
  });

  it('does not ask for the timer without tasks:read', async () => {
    render(withPermissions([], <TimerPill slug="acme" />));
    expect(api.running).not.toHaveBeenCalled();
  });
});
