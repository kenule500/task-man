import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { makeProject } from '@/features/projects/__tests__/fixtures';
import { ImportWizard } from '../components/ImportWizard';
import { useImportWizard } from '../hooks/useImportWizard';
import { importApi } from '../api';
import type { ImportPreview, ImportResult } from '../types';

jest.mock('../api', () => ({ importApi: { preview: jest.fn(), commit: jest.fn() } }));
jest.setTimeout(30000);

const api = importApi as jest.Mocked<typeof importApi>;

const preview: ImportPreview = {
  source: 'csv',
  total: 3,
  limit: 2000,
  skipped: 0,
  columns: ['To do', 'Done'],
  statuses: [
    { name: 'To do', count: 2, suggested: 'pending' },
    { name: 'Done', count: 1, suggested: 'completed' },
  ],
  types: [],
  people: [{ identifier: 'dan@example.com', count: 1, isMember: true, memberId: 'm1', memberName: 'Dan Developer' }],
  labels: [],
  sprints: [],
  withParent: 1,
  withEpic: 0,
  comments: 0,
  members: [{ id: 'm1', name: 'Dan Developer' }],
  stages: [
    { key: 'todo', name: 'To do', group: 'pending' },
    { key: 'in-progress', name: 'In progress', group: 'in-progress' },
    { key: 'done', name: 'Done', group: 'completed' },
  ],
  items: [
    {
      externalId: 'T-1', title: 'Design login', status: 'To do', type: '', priority: 'high', labels: [], assignees: ['dan@example.com'],
      dueDate: '2030-06-15', startDate: null, storyPoints: null, parentExternalId: null, epicExternalId: null, sprint: null, comments: 0, checklist: 0,
    },
  ],
  warnings: ['1 date could not be read and was left empty'],
};

const result: ImportResult = {
  created: 3, skipped: 0, sprintsCreated: 0, warnings: [], project: { _id: 'p9', name: 'Tasks export', key: 'TE' },
};

const Harness = ({ canCreateProject = true }: { canCreateProject?: boolean }) => {
  const projects = [makeProject({ name: 'Web' })];
  const wizard = useImportWizard('acme', { canCreateProject, projects });
  return <ImportWizard slug="acme" wizard={wizard} projects={projects} canCreateProject={canCreateProject} />;
};

const renderWizard = (props: { canCreateProject?: boolean } = {}) =>
  render(<MemoryRouter><Harness {...props} /></MemoryRouter>);

const csvFile = (name = 'tasks-export.csv', body = 'title\nA\nB\nC\n') => new File([body], name, { type: 'text/csv' });

describe('ImportWizard', () => {
  it('walks from source to result and sends the mapping the person confirmed', async () => {
    api.preview.mockResolvedValue(preview);
    api.commit.mockResolvedValue(result);
    const user = userEvent.setup();
    renderWizard();

    // 1. source
    expect(screen.getByRole('list', { name: 'Import progress' })).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: /CSV file/ }));
    expect(screen.getByText('How to export from CSV file')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Download the CSV template/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Continue/ }));

    // 2. file (Continue waits for the preview)
    expect(screen.getByRole('button', { name: /Continue/ })).toBeDisabled();
    await user.upload(screen.getByLabelText(/Drop your/), csvFile());
    await waitFor(() => expect(screen.getByRole('button', { name: /Continue/ })).toBeEnabled());
    expect(api.preview).toHaveBeenCalledWith('acme', 'csv', 'title\nA\nB\nC\n');
    expect(screen.getByText('tasks-export.csv')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Continue/ }));

    // 3. map: a new project named after the file, statuses already guessed
    expect(screen.getByRole('heading', { name: 'Map it to this workspace' })).toBeInTheDocument();
    expect(screen.getByLabelText(/Project name/)).toHaveValue('Tasks export');
    expect(screen.getByLabelText(/^Key/)).toHaveValue('TE');
    expect(screen.getByRole('combobox', { name: 'Column for To do' })).toHaveTextContent('To do');
    expect(screen.getByRole('combobox', { name: 'Column for Done' })).toHaveTextContent('Done');
    expect(screen.getByRole('combobox', { name: 'Member for dan@example.com' })).toHaveValue('Dan Developer');
    await user.click(screen.getByRole('button', { name: /Continue/ }));

    // 4. review
    expect(screen.getByRole('heading', { name: 'Review before importing' })).toBeInTheDocument();
    const summary = screen.getByRole('region', { name: /Rows to import/ });
    expect(within(summary).getByText('Design login')).toBeInTheDocument();
    expect(within(summary).getByText('Dan Developer')).toBeInTheDocument();
    expect(screen.getByText('1 date could not be read and was left empty')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Import 3 tasks' }));

    // 5. result
    expect(await screen.findByText('Imported 3 tasks into Tasks export')).toBeInTheDocument();
    expect(api.commit).toHaveBeenCalledWith('acme', 'csv', 'title\nA\nB\nC\n', {
      project: { name: 'Tasks export', key: 'TE' },
      statusMap: { 'To do': 'todo', Done: 'done' },
      userMap: { 'dan@example.com': 'm1' },
      typeMap: {},
      createSprints: false,
      includeComments: false,
    });
    expect(screen.getByRole('link', { name: 'Open the board' })).toHaveAttribute('href', '/acme/tasks?view=board&project=Tasks%20export');
  });

  it('shows a clear message for a file the server cannot read and for a wrong file type', async () => {
    api.preview.mockRejectedValueOnce({ response: { status: 400, data: { message: 'No title column found.' } }, isAxiosError: true });
    const user = userEvent.setup({ applyAccept: false });
    renderWizard();
    await user.click(screen.getByRole('radio', { name: /CSV file/ }));
    await user.click(screen.getByRole('button', { name: /Continue/ }));

    await user.upload(screen.getByLabelText(/Drop your/), csvFile('bad.csv', 'colour\nred\n'));
    expect(await screen.findByRole('alert')).toHaveTextContent('No title column found.');
    expect(screen.getByRole('button', { name: /Continue/ })).toBeDisabled();

    await user.upload(screen.getByLabelText(/Drop your/), new File(['x'], 'photo.png', { type: 'image/png' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/Choose a \.csv/));
    expect(api.preview).toHaveBeenCalledTimes(1);
  });

  it('keeps the person on the review step with the reason when the import fails', async () => {
    api.preview.mockResolvedValue(preview);
    api.commit.mockRejectedValueOnce({ response: { status: 409, data: { message: 'A project with this name already exists' } }, isAxiosError: true });
    const user = userEvent.setup();
    renderWizard();
    await user.click(screen.getByRole('radio', { name: /CSV file/ }));
    await user.click(screen.getByRole('button', { name: /Continue/ }));
    await user.upload(screen.getByLabelText(/Drop your/), csvFile());
    await waitFor(() => expect(screen.getByRole('button', { name: /Continue/ })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: /Continue/ }));
    await user.click(screen.getByRole('button', { name: /Continue/ }));
    await user.click(screen.getByRole('button', { name: 'Import 3 tasks' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('A project with this name already exists');
    await user.click(screen.getByRole('button', { name: 'Back to review' }));
    expect(screen.getByRole('heading', { name: 'Review before importing' })).toBeInTheDocument();
  });

  it('blocks Continue on the map step until the project is valid, and offers existing projects only without permission', async () => {
    api.preview.mockResolvedValue(preview);
    const user = userEvent.setup();
    renderWizard({ canCreateProject: false });
    await user.click(screen.getByRole('radio', { name: /CSV file/ }));
    await user.click(screen.getByRole('button', { name: /Continue/ }));
    await user.upload(screen.getByLabelText(/Drop your/), csvFile());
    await waitFor(() => expect(screen.getByRole('button', { name: /Continue/ })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: /Continue/ }));

    expect(screen.getByRole('radio', { name: 'New project' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'Project' })).toHaveValue('Web');
    expect(screen.getByRole('button', { name: /Continue/ })).toBeEnabled();
  });
});
