import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import api from '@/utils/api';
import BoardView from '@/features/tasks/views/BoardView';
import { StatusSelect } from '@/features/tasks/components/TaskSelects';
import { StatusBadge } from '@/features/tasks/components/TaskBadges';
import { makeTask } from '@/features/tasks/__tests__/fixtures';
import type { TaskViewProps } from '@/features/tasks/views/types';
import { resetWorkflowCache } from '../hooks/useWorkflow';
import { STAGE_TEMPLATES } from '../lib/stages';

jest.mock('@/utils/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), put: jest.fn() },
  getApiErrorMessage: (_error: unknown, fallback: string) => fallback,
}));

jest.setTimeout(30000);

const mockedApi = api as jest.Mocked<typeof api>;
const scrum = STAGE_TEMPLATES[0].stages.map(stage => (stage.key === 'in-review' ? { ...stage, wipLimit: 1 } : stage));

const handlers = (): Omit<TaskViewProps, 'tasks'> => ({
  onUpdate: jest.fn().mockResolvedValue(null),
  onEdit: jest.fn(),
  onDelete: jest.fn(),
  onCreate: jest.fn(),
});

beforeEach(() => {
  resetWorkflowCache();
  mockedApi.get.mockReset();
  mockedApi.get.mockImplementation(async (url: string) => {
    if (url.endsWith('/workflow')) return { data: { stages: scrum } };
    throw { response: { status: 404 } };
  });
});

const renderAt = (ui: React.ReactElement) =>
  render(
    <MemoryRouter initialEntries={['/acme/tasks']}>
      <Routes><Route path="/:workspaceSlug/tasks" element={ui} /></Routes>
    </MemoryRouter>,
  );

const columns = () => screen.getAllByRole('region');

describe('BoardView with workflow stages', () => {
  const tasks = [
    makeTask({ title: 'Plain', status: 'in-progress' }),
    makeTask({ title: 'Reviewed', status: 'in-progress', stage: 'in-review' }),
    makeTask({ title: 'Tested', status: 'in-progress', stage: 'qa' }),
    makeTask({ title: 'Stale', status: 'completed', stage: 'in-review' }),
  ];

  it('renders one column per stage with its tasks, and resolves stale stages', async () => {
    renderAt(<BoardView tasks={tasks} {...handlers()} />);
    await waitFor(() => expect(columns()).toHaveLength(5));

    expect(columns().map(column => within(column).getByRole('heading').textContent))
      .toEqual(['To do', 'In progress', 'In review', 'QA', 'Done']);
    const titlesIn = (index: number) => within(columns()[index]).queryAllByRole('article').map(card => within(card).getByRole('button', { name: /^(Plain|Reviewed|Tested|Stale)/ }).textContent);
    expect(titlesIn(1)).toEqual(['Plain']);
    expect(titlesIn(2)).toEqual(['Reviewed']);
    expect(titlesIn(3)).toEqual(['Tested']);
    expect(titlesIn(4)).toEqual(['Stale']);
  });

  it('shows the WIP limit badge and warns when a stage is over its limit', async () => {
    const crowded = [
      makeTask({ title: 'One', status: 'in-progress', stage: 'in-review' }),
      makeTask({ title: 'Two', status: 'in-progress', stage: 'in-review' }),
    ];
    renderAt(<BoardView tasks={crowded} {...handlers()} />);
    await waitFor(() => expect(columns()).toHaveLength(5));
    const review = columns()[2];
    expect(within(review).getByText('2 / 1')).toBeInTheDocument();
    expect(within(review).getByText('over WIP limit')).toBeInTheDocument();
  });

  it('sends the stage when a card is moved from its menu', async () => {
    const props = handlers();
    const task = makeTask({ title: 'Plain', status: 'in-progress' });
    renderAt(<BoardView tasks={[task]} {...props} />);
    await waitFor(() => expect(columns()).toHaveLength(5));

    await userEvent.click(screen.getByRole('button', { name: 'Actions for Plain' }));
    await userEvent.click(await screen.findByRole('menuitemradio', { name: 'QA' }));
    expect(props.onUpdate).toHaveBeenCalledWith(task._id, expect.objectContaining({ stage: 'qa' }));
    expect(props.onUpdate).toHaveBeenCalledWith(task._id, expect.not.objectContaining({ status: expect.anything() }));
  });

  it('sends the stage when a card is dropped on a column', async () => {
    const props = handlers();
    const task = makeTask({ title: 'Plain', status: 'in-progress' });
    renderAt(<BoardView tasks={[task]} {...props} />);
    await waitFor(() => expect(columns()).toHaveLength(5));

    const data = { getData: () => task._id, setData: jest.fn(), effectAllowed: '' };
    await act(async () => {
      fireEvent.drop(columns()[3], { dataTransfer: data });
    });
    expect(props.onUpdate).toHaveBeenCalledWith(task._id, expect.objectContaining({ stage: 'qa' }));
  });

  it('offers the phone quick move to the next stage and prefills new tasks with the stage', async () => {
    const props = handlers();
    renderAt(<BoardView tasks={[makeTask({ title: 'Plain', status: 'in-progress' })]} {...props} />);
    await waitFor(() => expect(columns()).toHaveLength(5));

    expect(screen.getByRole('button', { name: 'Next Plain: move to In review' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Add task to QA' }));
    expect(props.onCreate).toHaveBeenCalledWith({ status: 'in-progress', stage: 'qa' });
  });
});

describe('status controls with stages', () => {
  it('shows the stage name in the badge once the workflow is loaded', async () => {
    renderAt(<StatusBadge status="in-progress" stage="qa" />);
    expect(await screen.findByText('QA')).toBeInTheDocument();
  });

  it('keeps the plain status label when the stage is not passed', async () => {
    renderAt(<StatusBadge status="in-progress" />);
    await waitFor(() => expect(mockedApi.get).toHaveBeenCalled());
    expect(screen.getByText('In Progress')).toBeInTheDocument();
  });

  it('lists stages grouped by status and reports the chosen stage', async () => {
    const onStageChange = jest.fn();
    renderAt(<StatusSelect value="in-progress" stage="in-review" onChange={jest.fn()} onStageChange={onStageChange} aria-label="Status" />);
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Status' })).toHaveTextContent('In review'));
    const trigger = screen.getByRole('combobox', { name: 'Status' });

    await userEvent.click(trigger);
    expect(await screen.findByText('Pending')).toBeInTheDocument();
    await userEvent.click(await screen.findByRole('option', { name: 'QA' }));
    expect(onStageChange).toHaveBeenCalledWith('qa');
  });

  it('falls back to the three statuses when the workflow cannot be loaded', async () => {
    mockedApi.get.mockRejectedValue({ response: { status: 500 } });
    const onChange = jest.fn();
    renderAt(<StatusSelect value="pending" onChange={onChange} onStageChange={jest.fn()} aria-label="Status" />);
    const trigger = await screen.findByRole('combobox', { name: 'Status' });
    expect(trigger).toHaveTextContent('Pending');
    await userEvent.click(trigger);
    expect(await screen.findByRole('option', { name: 'In Progress' })).toBeInTheDocument();
  });
});
