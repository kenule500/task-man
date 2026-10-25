import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { Toaster, toast } from '@/components/ds';
import { aiPlanApi } from '@/features/ai-plan/api';
import { makeAiPlan, makePlan } from '@/features/ai-plan/__tests__/fixtures';
import { aiReviewApi } from '@/features/ai-review/api';
import { settings } from '@/features/ai-review/__tests__/fixtures';
import { ProjectsContext } from '@/features/projects/context/ProjectsContext';
import { makeProject } from '@/features/projects/__tests__/fixtures';
import AiProjectPage from '../AiProjectPage';

jest.setTimeout(60000);

jest.mock('@/components/AppShell', () => ({
  __esModule: true,
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

jest.mock('@/features/ai-plan/api', () => ({
  ...jest.requireActual('@/features/ai-plan/api'),
  aiPlanApi: { upload: jest.fn(), get: jest.fn(), list: jest.fn(), update: jest.fn(), create: jest.fn(), remove: jest.fn() },
}));

jest.mock('@/features/ai-review/api', () => ({
  aiReviewApi: { getSettings: jest.fn() },
}));

let granted: string[] = [];
jest.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ can: (permission: string) => granted.includes(permission), user: null, loading: false }),
}));

const plans = aiPlanApi as jest.Mocked<typeof aiPlanApi>;
const aiSettings = aiReviewApi as jest.Mocked<typeof aiReviewApi>;
const WRITER = ['projects:read', 'projects:write', 'tasks:read', 'tasks:write'];

const website = makeProject({ _id: 'p1', name: 'Website', key: 'WEB' });
const reload = jest.fn().mockResolvedValue(undefined);
const directory = { slug: 'demo', projects: [website], loading: false, byName: () => undefined, reload };

const Where = () => <p data-testid="where">{useLocation().pathname}{useLocation().search}</p>;

const renderPage = (entry = '/demo/projects/new/ai') =>
  render(
    <ProjectsContext.Provider value={directory}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/:workspaceSlug/projects/new/ai" element={<><AiProjectPage /><Where /></>} />
          <Route path="/:workspaceSlug/projects/:projectId/plan" element={<><AiProjectPage /><Where /></>} />
          <Route path="/:workspaceSlug/projects/:projectId" element={<><h1>Project page</h1><Where /></>} />
        </Routes>
        <Toaster />
      </MemoryRouter>
    </ProjectsContext.Provider>,
  );

const queued = () => makeAiPlan({ status: 'queued', plan: null, counts: null, startedAt: null, completedAt: null });
const pdf = () => new File([new Uint8Array(4096)], 'bookshop.pdf', { type: 'application/pdf' });

/** Picks the document and presses Analyze. */
const analyze = async (user: ReturnType<typeof userEvent.setup>) => {
  await screen.findByText(/AI is on for this workspace/);
  await user.upload(screen.getByLabelText(/Drop your document here/), pdf());
  await user.click(screen.getByRole('button', { name: 'Analyze document' }));
};

beforeEach(() => {
  jest.useFakeTimers();
  granted = WRITER;
  directory.projects = [website];
  aiSettings.getSettings.mockResolvedValue(settings());
  plans.list.mockResolvedValue([]);
  plans.remove.mockResolvedValue(undefined);
});

afterEach(() => {
  toast.clear();
  jest.useRealTimers();
});

describe('AiProjectPage', () => {
  it('TEST-003 AC-003 (superseded by AC-034): the upload step has no destination choice and always asks for the new project name and key', async () => {
    renderPage();
    await screen.findByText(/AI is on for this workspace/);

    // The destination picker was removed with US-013: this page always creates a new project.
    expect(screen.queryByRole('radiogroup', { name: /destination/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Plan destination')).not.toBeInTheDocument();
    expect(screen.queryByText('Add to an existing project')).not.toBeInTheDocument();

    expect(screen.getByLabelText('Project name')).toBeInTheDocument();
    expect(screen.getByLabelText('Project key')).toBeInTheDocument();
  });

  it('TEST-011 AC-011 (superseded by AC-030/AC-046): the surviving upload controls keep programmatic labels and keyboard focus', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    renderPage();
    await screen.findByText(/AI is on for this workspace/);

    const name = screen.getByLabelText('Project name');
    const key = screen.getByLabelText('Project key');
    expect(name.tagName).toBe('INPUT');
    expect(key.tagName).toBe('INPUT');

    name.focus();
    expect(name).toHaveFocus();
    await user.keyboard('Online Bookshop');
    expect(name).toHaveValue('Online Bookshop');

    key.focus();
    expect(key).toHaveFocus();
    await user.keyboard('book');
    expect(key).toHaveValue('BOOK');
  });

  it('TEST-034/TEST-035 AC-034/AC-035: walks from the upload to the new project: analyze, review, create, open', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    plans.upload.mockResolvedValue(queued());
    plans.get.mockResolvedValueOnce(makeAiPlan({ status: 'running', plan: null, counts: null })).mockResolvedValue(makeAiPlan());
    plans.update.mockImplementation(async (_slug, _id, plan) => makeAiPlan({ plan }));
    plans.create.mockResolvedValue({
      project: { _id: 'p-new', name: 'Online Bookshop', key: 'BOOK' },
      counts: { sprints: 2, epics: 1, items: 3, subtasks: 2, tasks: 6, criteria: 5 },
    });
    renderPage();

    // 1. upload
    expect(await screen.findByRole('heading', { level: 1, name: 'Create a project from a document' })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Progress' })).toBeInTheDocument();
    await analyze(user);
    expect(plans.upload).toHaveBeenCalledTimes(1);
    const [slug, file, options] = plans.upload.mock.calls[0];
    expect(slug).toBe('demo');
    expect(file.name).toBe('bookshop.pdf');
    expect(options).toMatchObject({ sprintLengthWeeks: 2, language: 'en' });

    // 2. analyzing, then the plan arrives (the address keeps the plan id)
    expect(await screen.findByText('The AI is building your project')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Analysis progress' })).toBeInTheDocument();
    expect(screen.getByText('Designing sprints')).toBeInTheDocument();
    expect(screen.getByTestId('where')).toHaveTextContent('?plan=plan-1');

    // 3. review
    const header = await screen.findByRole('region', { name: 'Generated project' }, { timeout: 10000 });
    expect(within(header).getByText('Ready')).toBeInTheDocument();
    expect(plans.get).toHaveBeenCalledWith('demo', 'plan-1', expect.anything());
    expect(screen.getByText('Gift cards')).toBeInTheDocument();

    // change one thing, then create: the edits are saved first
    await user.click(screen.getByRole('button', { name: /^Gift cards \(edit title/ }));
    const input = screen.getByRole('textbox', { name: 'title of Gift cards' });
    await user.clear(input);
    await user.type(input, 'Gift vouchers{Enter}');
    await user.click(screen.getAllByRole('button', { name: /^Create project/ })[0]);

    // 4. created: opens the project
    expect(await screen.findByRole('heading', { name: 'Project page' })).toBeInTheDocument();
    expect(plans.update).toHaveBeenCalledTimes(1);
    expect(plans.update.mock.calls[0][1]).toBe('plan-1');
    expect(plans.update.mock.calls[0][2].items.map(item => item.title)).toContain('Gift vouchers');
    expect(plans.create).toHaveBeenCalledWith('demo', 'plan-1', null);
    expect(plans.update.mock.invocationCallOrder[0]).toBeLessThan(plans.create.mock.invocationCallOrder[0]);
    expect(screen.getByTestId('where')).toHaveTextContent('/demo/projects/p-new');
    expect(await screen.findByText('Project “Online Bookshop” created')).toBeInTheDocument();
  });

  it('AC-002/AC-006: goes back to the upload with the reason when the generation fails, keeping the document', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    plans.upload.mockResolvedValue(queued());
    plans.get.mockResolvedValue(makeAiPlan({ status: 'failed', plan: null, counts: null, errorCode: 'AI_RATE_LIMIT', error: 'raw' }));
    renderPage();
    await analyze(user);

    expect(await screen.findByText(/limiting requests or the account has no quota left/, undefined, { timeout: 10000 })).toBeInTheDocument();
    expect(screen.getByText('We could not start the analysis')).toBeInTheDocument();
    // the file is still chosen, so trying again is one click
    expect(screen.getByText('bookshop.pdf')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Analyze document' })).toBeEnabled();
  });

  it('TEST-006 AC-006: generates the plan again from the document still held in the tab, deleting the old plan first', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    plans.upload.mockResolvedValueOnce(queued()).mockResolvedValueOnce({ ...queued(), _id: 'plan-2' });
    plans.get.mockImplementation(async (_slug, id) => makeAiPlan({ _id: id }));
    renderPage();
    await analyze(user);
    await screen.findByRole('region', { name: 'Generated project' }, { timeout: 10000 });

    await user.click(screen.getAllByRole('button', { name: 'Regenerate' })[0]);
    await waitFor(() => expect(plans.upload).toHaveBeenCalledTimes(2));
    expect(plans.remove).toHaveBeenCalledWith('demo', 'plan-1');
    expect(plans.upload.mock.calls[1][1]).toBe(plans.upload.mock.calls[0][1]);
    expect(plans.upload.mock.calls[1][2]).toEqual(plans.upload.mock.calls[0][2]);
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('?plan=plan-2'));
    expect(await screen.findByRole('region', { name: 'Generated project' }, { timeout: 10000 })).toBeInTheDocument();
  });

  it('shows a refused upload without leaving the first step', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    plans.upload.mockRejectedValue({ response: { status: 503, data: { code: 'AI_DISABLED', message: 'raw' } } });
    renderPage();
    await analyze(user);
    expect(await screen.findByText(/AI is turned off for this workspace or not set up/)).toBeInTheDocument();
    expect(screen.queryByText('The AI is building your project')).not.toBeInTheDocument();
  });

  it('AC-006: cancels a generation that is running and returns to the upload', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    plans.upload.mockResolvedValue(queued());
    plans.get.mockResolvedValue(makeAiPlan({ status: 'running', plan: null, counts: null }));
    renderPage();
    await analyze(user);

    await user.click(await screen.findByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(plans.remove).toHaveBeenCalledWith('demo', 'plan-1'));
    expect(await screen.findByRole('button', { name: 'Analyze document' })).toBeInTheDocument();
    expect(screen.getByTestId('where')).not.toHaveTextContent('plan=');
  });

  it('TEST-004 AC-004: picks a plan up again from the address after a reload', async () => {
    plans.get.mockResolvedValue(makeAiPlan());
    renderPage('/demo/projects/new/ai?plan=plan-1');
    expect(await screen.findByRole('region', { name: 'Generated project' })).toBeInTheDocument();
    expect(plans.get).toHaveBeenCalledWith('demo', 'plan-1');
    // the document is not in this tab any more, so it cannot be regenerated from here
    expect(screen.getAllByRole('button', { name: 'Regenerate' })[0]).toBeDisabled();
  });

  it('AC-004: opens the project when the plan in the address was already created', async () => {
    plans.get.mockResolvedValue(makeAiPlan({ status: 'created', projectId: 'p-done' }));
    renderPage('/demo/projects/new/ai?plan=plan-1');
    expect(await screen.findByRole('heading', { name: 'Project page' })).toBeInTheDocument();
    expect(screen.getByTestId('where')).toHaveTextContent('/demo/projects/p-done');
  });

  it('says so when the plan in the address no longer exists', async () => {
    plans.get.mockRejectedValue({ response: { status: 404, data: { message: 'Plan not found' } } });
    renderPage('/demo/projects/new/ai?plan=gone');
    expect(await screen.findByText(/This plan no longer exists/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Analyze document' })).toBeDisabled();
  });

  it('AC-007: asks for another name when the project name is taken, and creates after the fix', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    plans.get.mockResolvedValue(makeAiPlan({ plan: makePlan() }));
    plans.update.mockImplementation(async (_slug, _id, plan) => makeAiPlan({ plan }));
    plans.create
      .mockRejectedValueOnce({ response: { status: 409, data: { code: 'PROJECT_NAME_TAKEN', message: 'A project with this name already exists. Choose another name.', suggestion: 'Online Bookshop (2)' } } })
      .mockResolvedValueOnce({ project: { _id: 'p-2', name: 'Online Bookshop (2)', key: 'BOOK' }, counts: { sprints: 2, epics: 1, items: 3, subtasks: 2, tasks: 6, criteria: 5 } });
    renderPage('/demo/projects/new/ai?plan=plan-1');

    await user.click((await screen.findAllByRole('button', { name: /^Create project/ }))[0]);
    expect(await screen.findByText('A project with this name already exists')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Use “Online Bookshop (2)”' }));
    expect(screen.getByRole('heading', { name: /Online Bookshop \(2\)/ })).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: /^Create project/ })[0]);

    expect(await screen.findByRole('heading', { name: 'Project page' })).toBeInTheDocument();
    expect(plans.update.mock.calls.at(-1)?.[2].project.name).toBe('Online Bookshop (2)');
    expect(plans.create).toHaveBeenCalledTimes(2);
  });

  it('TEST-037 AC-037: opens the wizard for the project, fixes the destination and hides the name and key fields', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    plans.upload.mockResolvedValue(queued());
    plans.get.mockResolvedValue(makeAiPlan({
      options: { ...makeAiPlan().options, targetProjectId: 'p1' },
      targetProject: { _id: 'p1', name: 'Website', key: 'WEB', archived: false },
    }));
    renderPage('/demo/projects/p1/plan');

    expect(await screen.findByRole('heading', { level: 1, name: 'Add a plan to Website' })).toBeInTheDocument();
    expect(screen.getByText('Adding to Website')).toBeInTheDocument();
    expect(screen.getByText('WEB')).toBeInTheDocument();
    expect(screen.queryByLabelText('Project name')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^Project key/)).not.toBeInTheDocument();

    await analyze(user);
    expect(plans.upload.mock.calls[0][2]).toMatchObject({ destination: 'existing', targetProjectId: 'p1' });

    // The review names the project and offers no destination choice
    const destination = await screen.findByRole('region', { name: 'Plan destination' }, { timeout: 10000 });
    expect(within(destination).getByText('Website (WEB)')).toBeInTheDocument();
    expect(within(destination).getByText('Existing project')).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /destination|project/i })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^Add \d+ items? to Website \(WEB\)/ })[0]).toBeInTheDocument();
  });

  it('TEST-038 AC-010/AC-038: adds the reviewed plan to the project, says so and returns to the project', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    plans.get.mockResolvedValue(makeAiPlan({
      options: { ...makeAiPlan().options, targetProjectId: 'p1' },
      targetProject: { _id: 'p1', name: 'Website', key: 'WEB', archived: false },
    }));
    plans.update.mockImplementation(async (_slug, _id, plan) => makeAiPlan({ plan }));
    plans.create.mockResolvedValue({
      project: { _id: 'p1', name: 'Website', key: 'WEB' },
      counts: { sprints: 2, epics: 1, items: 3, subtasks: 2, tasks: 6, criteria: 5 },
      destination: 'existing',
    });
    renderPage('/demo/projects/p1/plan?plan=plan-1');

    await user.click((await screen.findAllByRole('button', { name: /^Add \d+ items? to Website \(WEB\)/ }, { timeout: 10000 }))[0]);
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText('Add this plan to “Website (WEB)”?')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: /^Add \d+ items?$/ }));

    await waitFor(() => expect(plans.create).toHaveBeenCalledWith('demo', 'plan-1', 'p1'));
    expect(await screen.findByRole('heading', { name: 'Project page' })).toBeInTheDocument();
    expect(screen.getByTestId('where')).toHaveTextContent('/demo/projects/p1');
    expect(screen.getByTestId('where')).not.toHaveTextContent('plan=');
    expect(await screen.findByText('Plan added to “Website”')).toBeInTheDocument();
    expect(screen.getByText('6 tasks in 2 sprints were added. The project\'s existing work was not changed.')).toBeInTheDocument();
    expect(reload).toHaveBeenCalled();
  });

  it('TEST-039 AC-039: refuses a plan stored for another project and points at the plan instead of writing', async () => {
    plans.get.mockResolvedValue(makeAiPlan({
      options: { ...makeAiPlan().options, targetProjectId: 'p2' },
      targetProject: { _id: 'p2', name: 'Mobile app', key: 'MOB', archived: false },
    }));
    renderPage('/demo/projects/p1/plan?plan=plan-1');

    expect(await screen.findByText('This plan belongs to another project')).toBeInTheDocument();
    expect(screen.getByText(/started for another project or is already created/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open the plan' })).toHaveAttribute('href', '/demo/projects/new/ai?plan=plan-1');
    expect(screen.getAllByRole('link', { name: 'Back to the project' })
      .some(link => link.getAttribute('href') === '/demo/projects/p1')).toBe(true);
    expect(screen.getByTestId('where')).toHaveTextContent('/demo/projects/p1/plan');
    expect(screen.getByTestId('where')).not.toHaveTextContent('plan=');
    expect(plans.update).not.toHaveBeenCalled();
    expect(plans.create).not.toHaveBeenCalled();
    expect(plans.remove).not.toHaveBeenCalled();
  });

  it('AC-039: opens the project a plan already created instead of adding it again', async () => {
    plans.get.mockResolvedValue(makeAiPlan({ status: 'created', projectId: 'p-done', targetProject: null }));
    renderPage('/demo/projects/p1/plan?plan=plan-1');

    expect(await screen.findByRole('heading', { name: 'Project page' })).toBeInTheDocument();
    expect(screen.getByTestId('where')).toHaveTextContent('/demo/projects/p-done');
    expect(plans.update).not.toHaveBeenCalled();
    expect(plans.create).not.toHaveBeenCalled();
    expect(plans.remove).not.toHaveBeenCalled();
  });

  it('refuses an archived project before the wizard starts', async () => {
    directory.projects = [website, makeProject({ _id: 'p-archived', name: 'Old site', key: 'OLD', archived: true })];
    renderPage('/demo/projects/p-archived/plan');

    expect(await screen.findByText('This project is archived')).toBeInTheDocument();
    expect(screen.queryByLabelText(/Drop your document here/)).not.toBeInTheDocument();
    expect(plans.upload).not.toHaveBeenCalled();
  });

  it('AC-034/AC-035: does not offer the page to people who cannot create both projects and tasks', async () => {
    granted = ['projects:read', 'projects:write', 'tasks:read'];
    renderPage();
    expect(await screen.findByText('You cannot create projects with AI')).toBeInTheDocument();
    expect(aiSettings.getSettings).not.toHaveBeenCalled();
    expect(screen.queryByLabelText(/Drop your document here/)).not.toBeInTheDocument();
  });
});
