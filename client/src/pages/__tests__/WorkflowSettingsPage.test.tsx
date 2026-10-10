import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { workflowApi } from '@/features/workflow/api';
import { resetWorkflowCache } from '@/features/workflow/hooks/useWorkflow';
import { DEFAULT_STAGES } from '@/features/workflow/lib/stages';
import WorkflowSettingsPage from '../WorkflowSettingsPage';

jest.setTimeout(30000);

jest.mock('@/features/workflow/api', () => ({
  workflowApi: { get: jest.fn(), save: jest.fn() },
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

const api = workflowApi as jest.Mocked<typeof workflowApi>;

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/acme/settings/workflow']}>
      <Routes><Route path="/:workspaceSlug/settings/workflow" element={<WorkflowSettingsPage />} /></Routes>
    </MemoryRouter>,
  );

beforeEach(() => {
  resetWorkflowCache();
  granted = ['settings:manage'];
  api.get.mockReset();
  api.save.mockReset();
  api.get.mockResolvedValue(DEFAULT_STAGES.map(stage => ({ ...stage })));
  api.save.mockImplementation(async (_slug, update) => update.stages);
});

const stageList = () => screen.getByRole('list', { name: 'Workflow stages' });
const names = () => within(stageList()).getAllByRole('textbox', { name: 'Name' }).map(input => (input as HTMLInputElement).value);

describe('WorkflowSettingsPage', () => {
  it('asks for the settings permission', async () => {
    granted = [];
    renderPage();
    expect(await screen.findByText('Only people who manage settings can edit the workflow')).toBeInTheDocument();
  });

  it('lists the stages with a board preview', async () => {
    renderPage();
    await waitFor(() => expect(names()).toEqual(['To do', 'In progress', 'Done']));
    expect(within(screen.getByRole('list', { name: 'Board columns' })).getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  });

  it('adds a stage, needs a name, and saves the new key and order', async () => {
    renderPage();
    await waitFor(() => expect(names()).toHaveLength(3));

    await userEvent.click(screen.getByRole('button', { name: 'Add stage' }));
    expect(names()).toEqual(['To do', 'In progress', '', 'Done']);
    expect(screen.getByText('Give the stage a name.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();

    await userEvent.type(within(stageList()).getAllByRole('textbox', { name: 'Name' })[2], 'In review');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(api.save).toHaveBeenCalled());
    const [slug, update] = api.save.mock.calls[0];
    expect(slug).toBe('acme');
    expect(update.stages.map(stage => [stage.key, stage.name, stage.group])).toEqual([
      ['todo', 'To do', 'pending'],
      ['in-progress', 'In progress', 'in-progress'],
      ['in-review', 'In review', 'in-progress'],
      ['done', 'Done', 'completed'],
    ]);
    expect(update.moves).toEqual({});
  });

  it('asks which stage receives the tasks of a deleted stage', async () => {
    renderPage();
    await waitFor(() => expect(names()).toHaveLength(3));
    await userEvent.click(screen.getByRole('button', { name: 'Add stage' }));
    await userEvent.type(within(stageList()).getAllByRole('textbox', { name: 'Name' })[2], 'QA');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(api.save).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled());

    // Saved stages with tasks ask for a target; the last stage of a group cannot be deleted
    expect(screen.getByRole('button', { name: 'To do is the only stage in Pending' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Delete QA' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Move its tasks to')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete stage' }));

    expect(names()).toEqual(['To do', 'In progress', 'Done']);
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(api.save).toHaveBeenCalledTimes(2));
    expect(api.save.mock.calls[1][1].moves).toEqual({ qa: 'in-progress' });
  });

  it('replaces the stages from a template and cancel restores them', async () => {
    renderPage();
    await waitFor(() => expect(names()).toHaveLength(3));

    await userEvent.click(screen.getByRole('button', { name: /Use a template/ }));
    await userEvent.click(await screen.findByRole('menuitem', { name: /^Kanban/ }));
    expect(names()).toEqual(['Backlog', 'Ready', 'Doing', 'Review', 'Done']);

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(names()).toEqual(['To do', 'In progress', 'Done']);
  });

  it('reorders stages', async () => {
    renderPage();
    await waitFor(() => expect(names()).toHaveLength(3));
    await userEvent.click(screen.getByRole('button', { name: 'Move In progress down' }));
    expect(names()).toEqual(['To do', 'Done', 'In progress']);
  });

  it('shows a readable error when saving fails and keeps the edits', async () => {
    api.save.mockRejectedValue(new Error('boom'));
    renderPage();
    await waitFor(() => expect(names()).toHaveLength(3));
    await userEvent.clear(within(stageList()).getAllByRole('textbox', { name: 'Name' })[0]);
    await userEvent.type(within(stageList()).getAllByRole('textbox', { name: 'Name' })[0], 'Backlog');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText(/We could not save the workflow/)).toBeInTheDocument();
    expect(names()[0]).toBe('Backlog');
  });
});
