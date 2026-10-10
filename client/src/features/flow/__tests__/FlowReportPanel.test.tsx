import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { makeProject, makeSprint } from '@/features/projects/__tests__/fixtures';
import { flowApi } from '../api';
import FlowReportPanel from '../components/FlowReportPanel';
import { aging, emptyFlowReport, makeFlowReport } from './fixtures';

jest.setTimeout(30000);

jest.mock('../api', () => ({ flowApi: { report: jest.fn() } }));

const report = flowApi.report as jest.MockedFunction<typeof flowApi.report>;

const sprint = makeSprint({ _id: 's1', project: 'p-web', name: 'Sprint 7' });
const other = makeSprint({ _id: 's2', project: 'p-app', name: 'Sprint 1' });
const website = makeProject({ _id: 'p-web', name: 'Website', key: 'WEB', sprints: [sprint] });
const app = makeProject({ _id: 'p-app', name: 'Mobile app', key: 'APP', sprints: [other] });

const renderPanel = () => render(<FlowReportPanel slug="demo" projects={[website, app]} />);

beforeEach(() => {
  report.mockReset();
  report.mockResolvedValue(makeFlowReport());
});

describe('FlowReportPanel', () => {
  it('shows a loading state, then the summary, charts and aging list', async () => {
    renderPanel();
    expect(screen.getByRole('status', { name: 'Loading the flow report' })).toBeInTheDocument();

    expect(await screen.findByRole('heading', { name: 'Cumulative flow' })).toBeInTheDocument();
    const summary = screen.getByRole('region', { name: 'Flow summary' });
    expect(within(summary).getByText('Median cycle time')).toBeInTheDocument();
    expect(within(summary).getByText('4 days')).toBeInTheDocument();
    expect(within(summary).getByText('1 over the 85th percentile')).toBeInTheDocument();

    expect(screen.getByRole('img', { name: /^Cumulative flow from 2026-10-01 to 2026-10-07/ })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /^Cycle time scatter plot of 3 completed tasks/ })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /^Throughput: 3 tasks completed over 2 weeks/ })).toBeInTheDocument();
  });

  it('judges aging tasks against the 85th percentile and names the level', async () => {
    renderPanel();
    const section = (await screen.findByRole('heading', { name: 'Aging work in progress' })).closest('section') as HTMLElement;
    const rows = within(section).getAllByRole('listitem');
    expect(rows.map(row => within(row).getByText(/Aging \d/).textContent)).toEqual(['Aging 4', 'Aging 5', 'Aging 6']);
    // p85 of the fixture is 8 days: 9 is over, 5 is past half, 1 is fine
    expect(within(rows[0]).getByText('Over p85')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Watch')).toBeInTheDocument();
    expect(within(rows[2]).getByText('On track')).toBeInTheDocument();
    expect(within(rows[0]).getByRole('group', { name: 'Assigned to Ana Diaz' })).toBeInTheDocument();
  });

  it('offers every number of the charts in hidden tables', async () => {
    renderPanel();
    await screen.findByRole('heading', { name: 'Cumulative flow' });
    const cfd = screen.getByRole('table', { name: 'Tasks in each status at the end of every day' });
    expect(within(cfd).getAllByRole('row')).toHaveLength(8);
    expect(screen.getByRole('table', { name: 'Cycle time of tasks completed in this range' })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Tasks completed per week' })).toBeInTheDocument();
  });

  it('shows a tooltip and announces the point while arrow keys move through the days', async () => {
    const user = userEvent.setup();
    renderPanel();
    const chart = await screen.findByRole('group', { name: /^Cumulative flow chart/ });

    await act(async () => chart.focus());
    expect(chart).toHaveFocus();
    // Focus starts on the latest day
    expect(chart.querySelector('[aria-hidden="true"].absolute')).toHaveTextContent('Wed, Oct 7, 2026');
    await user.keyboard('{ArrowLeft}');
    expect(chart.querySelector('[aria-hidden="true"].absolute')).toHaveTextContent('Tue, Oct 6, 2026');
    expect(chart.parentElement?.querySelector('[aria-live="polite"]')).toHaveTextContent('Tue, Oct 6, 2026: 1 pending, 1 in progress, 1 completed');
    await user.keyboard('{Escape}');
    expect(chart.querySelector('[aria-hidden="true"].absolute')).toBeNull();
  });

  it('switches the scatter plot between cycle and lead time', async () => {
    const user = userEvent.setup();
    renderPanel();
    await screen.findByRole('heading', { name: 'Time to finish' });
    await user.click(screen.getByRole('radio', { name: 'Lead time' }));
    expect(screen.getByRole('img', { name: /^Lead time scatter plot of 3 completed tasks/ })).toBeInTheDocument();
  });

  it('asks the server for the chosen project, sprint and range', async () => {
    const user = userEvent.setup();
    renderPanel();
    await screen.findByRole('heading', { name: 'Cumulative flow' });
    expect(report).toHaveBeenLastCalledWith('demo', expect.objectContaining({ project: '', sprint: '' }));

    await user.selectOptions(screen.getByLabelText('Project'), 'Website');
    await waitFor(() => expect(report).toHaveBeenLastCalledWith('demo', expect.objectContaining({ project: 'Website' })));
    // Only the sprints of the chosen project are offered
    const sprints = within(screen.getByLabelText('Sprint')).getAllByRole('option').map(option => option.textContent);
    expect(sprints).toEqual(['All sprints', 'Sprint 7']);

    await user.selectOptions(screen.getByLabelText('Sprint'), 'Sprint 7');
    await waitFor(() => expect(report).toHaveBeenLastCalledWith('demo', expect.objectContaining({ project: 'Website', sprint: 's1' })));

    await user.selectOptions(screen.getByLabelText('Date range'), 'Last 90 days');
    await waitFor(() => {
      const params = report.mock.calls.at(-1)?.[1];
      expect(params?.sprint).toBe('s1');
      const days = (Date.parse(`${params?.to}T00:00:00Z`) - Date.parse(`${params?.from}T00:00:00Z`)) / 86_400_000 + 1;
      expect(days).toBe(90);
    });

    // Changing the project drops a sprint that belongs to another one
    await user.selectOptions(screen.getByLabelText('Project'), 'Mobile app');
    await waitFor(() => expect(report).toHaveBeenLastCalledWith('demo', expect.objectContaining({ project: 'Mobile app', sprint: '' })));
  });

  it('explains an empty range', async () => {
    report.mockResolvedValue(emptyFlowReport());
    renderPanel();
    expect(await screen.findByRole('heading', { name: 'No flow data yet' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Cumulative flow' })).toBeNull();
  });

  it('shows an error and loads again on retry', async () => {
    const user = userEvent.setup();
    report.mockRejectedValueOnce(new Error('boom'));
    renderPanel();
    expect(await screen.findByRole('alert')).toHaveTextContent('We could not load the flow report');

    await user.click(screen.getByRole('button', { name: /try again/i }));
    expect(await screen.findByRole('heading', { name: 'Cumulative flow' })).toBeInTheDocument();
    expect(report).toHaveBeenCalledTimes(2);
  });

  it('says so when nothing is in progress', async () => {
    report.mockResolvedValue(makeFlowReport({ aging: [] }));
    renderPanel();
    expect(await screen.findByText('Nothing is in progress right now.')).toBeInTheDocument();
  });

  it('warns that there is no baseline before any task is completed', async () => {
    report.mockResolvedValue(makeFlowReport({
      cycleTime: { count: 0, average: null, p50: null, p85: null, p95: null, points: [] },
      aging: [aging('9', 20)],
    }));
    renderPanel();
    expect(await screen.findByText('No baseline')).toBeInTheDocument();
  });
});
