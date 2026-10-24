import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { tasksApi } from '@/features/tasks/api';
import { makeTask } from '@/features/tasks/__tests__/fixtures';
import { projectsApi } from '@/features/projects/api';
import { makeProject, makeSprint } from '@/features/projects/__tests__/fixtures';
import i18n from '@/i18n';
import ProjectsPage from '../ProjectsPage';

jest.setTimeout(30000);

jest.mock('@/components/AppShell', () => ({
  __esModule: true,
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

jest.mock('@/features/tasks/api', () => ({
  ...jest.requireActual('@/features/tasks/api'),
  tasksApi: { list: jest.fn() },
}));

jest.mock('@/features/projects/api', () => ({
  projectsApi: { list: jest.fn(), create: jest.fn(), update: jest.fn(), remove: jest.fn() },
}));

let granted: string[] = [];
jest.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ can: (permission: string) => granted.includes(permission), user: null, loading: false }),
}));

const tasks = tasksApi as jest.Mocked<typeof tasksApi>;
const projects = projectsApi as jest.Mocked<typeof projectsApi>;

const sprint = makeSprint({ _id: 's1', name: 'Sprint 7', status: 'active' });
const website = makeProject({ _id: 'p-web', name: 'Website', key: 'WEB', color: 'violet', icon: 'rocket', sprints: [sprint] });
const mobile = makeProject({ _id: 'p-app', name: 'Mobile app', key: 'APP', color: 'teal' });
const legacy = makeProject({ _id: 'p-old', name: 'Legacy portal', key: 'OLD', archived: true });

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/demo/projects']}>
      <Routes>
        <Route path="/:workspaceSlug/projects" element={<ProjectsPage />} />
        <Route path="/:workspaceSlug/projects/new/ai" element={<p>AI project page</p>} />
      </Routes>
    </MemoryRouter>,
  );

const WRITER = ['projects:read', 'projects:write', 'projects:delete'];

const pageHeader = async (name = 'Projects') => {
  const heading = await screen.findByRole('heading', { level: 1, name });
  return heading.closest('header') as HTMLElement;
};

const headerActions = async () => within(await pageHeader()).getByRole('group', { name: 'Project actions' });
const activeGrid = () => screen.getByRole('list', { name: 'Projects' });

beforeEach(() => {
  granted = WRITER;
  projects.list.mockResolvedValue([website, mobile, legacy]);
  tasks.list.mockResolvedValue([
    makeTask({ project: 'Website', status: 'completed', sprint: 's1' }),
    makeTask({ project: 'website', sprint: 's1', deadline: '2020-01-01T00:00:00.000Z' }),
    makeTask({ project: 'Mobile app' }),
    makeTask({ project: 'Mobile app', parent: 'x' }),
  ]);
});

afterEach(async () => {
  await i18n.changeLanguage('en');
});

describe('ProjectsPage', () => {
  it('AC-040/AC-041/AC-042: shows one folder link per project with counts, progress and the active sprint', async () => {
    renderPage();

    expect(await screen.findByRole('heading', { level: 1, name: 'Projects' })).toBeInTheDocument();
    const link = await screen.findByRole('link', { name: 'Website' });
    expect(link).toHaveAttribute('href', '/demo/projects/p-web');

    const card = link.closest('li') as HTMLElement;
    expect(within(card).getByText(/2 tasks/)).toBeInTheDocument();
    expect(within(card).getByText('WEB')).toBeInTheDocument();
    expect(within(card).getByText('50% done')).toBeInTheDocument();
    expect(within(card).getByText('1 overdue')).toBeInTheDocument();
    expect(within(card).getByText(/Sprint 7 · 0%|Sprint 7 · 50%/)).toBeInTheDocument();
    expect(within(card).getByRole('progressbar', { name: 'Website progress' })).toHaveAttribute('aria-valuenow', '50');

    // Subtasks do not count as tasks
    const mobileCard = screen.getByRole('link', { name: 'Mobile app' }).closest('li') as HTMLElement;
    expect(within(mobileCard).getByText(/1 task\b/)).toBeInTheDocument();
    expect(within(mobileCard).getByText('No active sprint')).toBeInTheDocument();
  });

  it('gives each card two tab stops: the link and the actions menu', async () => {
    renderPage();
    const card = (await screen.findByRole('link', { name: 'Website' })).closest('li') as HTMLElement;
    expect(within(card).getAllByRole('link')).toHaveLength(1);
    expect(within(card).getAllByRole('button')).toHaveLength(1);
    expect(within(card).getByRole('button', { name: 'Actions for Website' })).toBeInTheDocument();
  });

  it('AC-041: keeps archived projects in a collapsed section', async () => {
    renderPage();
    await screen.findByRole('link', { name: 'Website' });

    expect(screen.queryByRole('link', { name: 'Legacy portal' })).not.toBeInTheDocument();
    const toggle = screen.getByRole('button', { name: /^Archived/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('link', { name: 'Legacy portal' })).toBeInTheDocument();
  });

  it('AC-041: filters by name or key and offers to clear an empty search', async () => {
    renderPage();
    await screen.findByRole('link', { name: 'Website' });
    const search = screen.getByRole('searchbox', { name: 'Search projects' });

    await userEvent.type(search, 'app');
    expect(screen.getByRole('link', { name: 'Mobile app' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Website' })).not.toBeInTheDocument();

    await userEvent.clear(search);
    await userEvent.type(search, 'zzz');
    expect(screen.getByText('No projects match')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(screen.getByRole('link', { name: 'Website' })).toBeInTheDocument();
  });

  it('archives a project from its menu', async () => {
    projects.update.mockResolvedValue({ ...website, archived: true });
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'Actions for Website' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Archive' }));

    await waitFor(() => expect(projects.update).toHaveBeenCalledWith('demo', 'p-web', { archived: true }));
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Website' })).not.toBeInTheDocument());
  });

  it('confirms before deleting a project', async () => {
    projects.remove.mockResolvedValue(undefined);
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'Actions for Mobile app' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));
    expect(projects.remove).not.toHaveBeenCalled();

    await userEvent.click(await screen.findByRole('button', { name: 'Delete project' }));
    await waitFor(() => expect(projects.remove).toHaveBeenCalledWith('demo', 'p-app'));
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Mobile app' })).not.toBeInTheDocument());
  });

  it('creates a project with a suggested key', async () => {
    projects.create.mockResolvedValue(makeProject({ _id: 'p-new', name: 'Design system refresh', key: 'DSR' }));
    renderPage();

    await userEvent.click((await screen.findAllByRole('button', { name: 'New project' }))[0]);
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText(/^Name/), 'Design system refresh');
    expect(within(dialog).getByLabelText('Key')).toHaveValue('DSR');

    await userEvent.click(within(dialog).getByLabelText('Berry'));
    await userEvent.click(within(dialog).getByLabelText('Palette'));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create project' }));

    await waitFor(() => expect(projects.create).toHaveBeenCalledWith('demo', {
      name: 'Design system refresh', key: 'DSR', description: '', color: 'rose', icon: 'palette',
    }));
    expect(await screen.findByRole('link', { name: 'Design system refresh' })).toBeInTheDocument();
  });

  it('validates the name and the key before saving', async () => {
    renderPage();
    await userEvent.click((await screen.findAllByRole('button', { name: 'New project' }))[0]);
    const dialog = await screen.findByRole('dialog');

    await userEvent.click(within(dialog).getByRole('button', { name: 'Create project' }));
    expect(within(dialog).getByText('Enter a project name.')).toBeInTheDocument();

    await userEvent.type(within(dialog).getByLabelText(/^Name/), 'Alpha');
    await userEvent.clear(within(dialog).getByLabelText('Key'));
    await userEvent.type(within(dialog).getByLabelText('Key'), 'a');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create project' }));
    expect(within(dialog).getByText(/2 to 6 letters or digits/)).toBeInTheDocument();
    expect(projects.create).not.toHaveBeenCalled();
  });

  it('shows the server message when saving fails', async () => {
    projects.create.mockRejectedValue({ response: { data: { message: 'A project with this name already exists' } } });
    renderPage();
    await userEvent.click((await screen.findAllByRole('button', { name: 'New project' }))[0]);
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText(/^Name/), 'Website');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create project' }));

    expect(await within(dialog).findByText('A project with this name already exists')).toBeInTheDocument();
  });

  it('AC-040/AC-043: hides write actions from read-only members', async () => {
    granted = ['projects:read'];
    renderPage();
    await screen.findByRole('link', { name: 'Website' });

    expect(screen.queryByRole('button', { name: 'New project' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Actions for Website' }));
    expect(await screen.findByRole('menuitem', { name: 'Open' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Delete' })).not.toBeInTheDocument();
  });

  it('AC-040/AC-043: offers "Create with AI" to people who can write both projects and tasks', async () => {
    granted = [...WRITER, 'tasks:write'];
    renderPage();
    const link = await screen.findByRole('link', { name: /Create with AI/ });
    expect(link).toHaveAttribute('href', '/demo/projects/new/ai');
  });

  it('AC-040/AC-043: keeps "Create with AI" away from people who cannot create tasks', async () => {
    renderPage();
    await screen.findByRole('link', { name: 'Website' });
    expect(screen.queryByRole('link', { name: /Create with AI/ })).not.toBeInTheDocument();
  });

  it('AC-042/AC-045: explains an empty workspace and offers the first project', async () => {
    projects.list.mockResolvedValue([]);
    renderPage();

    expect(await screen.findByText('No projects yet')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'New project' }).length).toBeGreaterThan(0);
  });

  it('reports a load failure', async () => {
    projects.list.mockRejectedValue(new Error('boom'));
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load projects');
  });

  it('AC-043: shows the header actions and opens the create-project dialog', async () => {
    granted = [...WRITER, 'tasks:write'];
    renderPage();
    await screen.findByRole('link', { name: 'Website' });

    const actions = await headerActions();
    expect(within(actions).getByRole('button', { name: 'New project' })).toBeInTheDocument();
    expect(within(actions).getByRole('button', { name: 'Create with AI' })).toBeInTheDocument();

    await userEvent.click(within(actions).getByRole('button', { name: 'New project' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('AC-043: opens the create-with-AI page from the header', async () => {
    granted = [...WRITER, 'tasks:write'];
    renderPage();
    await screen.findByRole('link', { name: 'Website' });

    await userEvent.click(within(await headerActions()).getByRole('button', { name: 'Create with AI' }));
    expect(await screen.findByText('AI project page')).toBeInTheDocument();
  });

  it('AC-043: keeps the dashed cards as the first items of the active grid', async () => {
    granted = [...WRITER, 'tasks:write'];
    renderPage();
    await screen.findByRole('link', { name: 'Website' });

    const grid = activeGrid();
    const [newCard, aiCard] = Array.from(grid.children);
    expect(within(newCard as HTMLElement).getByRole('button', { name: 'New project' })).toBeInTheDocument();
    expect(within(aiCard as HTMLElement).getByRole('link', { name: /Create with AI/ }))
      .toHaveAttribute('href', '/demo/projects/new/ai');
    expect(within(grid).getAllByRole('listitem')[0]).toBe(newCard);
  });

  it('AC-043: shows New project but not Create with AI without tasks:write', async () => {
    granted = [...WRITER];
    renderPage();
    await screen.findByRole('link', { name: 'Website' });

    const actions = await headerActions();
    expect(within(actions).getByRole('button', { name: 'New project' })).toBeInTheDocument();
    expect(within(actions).queryByRole('button', { name: 'Create with AI' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Create with AI/ })).not.toBeInTheDocument();
  });

  it('AC-043: shows no header actions to members without projects:write', async () => {
    granted = ['projects:read'];
    renderPage();
    await screen.findByRole('link', { name: 'Website' });

    expect(within(await pageHeader()).queryByRole('group', { name: 'Project actions' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New project' })).not.toBeInTheDocument();
  });

  it('AC-044: keeps header actions through search and archived views while hiding the cards', async () => {
    granted = [...WRITER, 'tasks:write'];
    renderPage();
    await screen.findByRole('link', { name: 'Website' });

    await userEvent.click(screen.getByRole('button', { name: /^Archived/ }));
    const archived = screen.getByRole('list', { name: 'Archived projects' });
    expect(within(archived).queryByRole('button', { name: 'New project' })).not.toBeInTheDocument();
    expect(within(archived).queryByRole('link', { name: /Create with AI/ })).not.toBeInTheDocument();
    expect(await headerActions()).toBeInTheDocument();

    await userEvent.type(screen.getByRole('searchbox', { name: 'Search projects' }), 'app');
    const active = activeGrid();
    expect(within(active).queryByRole('button', { name: 'New project' })).not.toBeInTheDocument();
    expect(within(active).queryByRole('link', { name: /Create with AI/ })).not.toBeInTheDocument();
    expect(await headerActions()).toBeInTheDocument();
  });

  it('AC-044: keeps the header actions when the sort changes', async () => {
    granted = [...WRITER, 'tasks:write'];
    renderPage();
    await screen.findByRole('link', { name: 'Website' });

    await userEvent.click(screen.getByRole('combobox', { name: 'Sort projects' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Progress' }));
    expect(await headerActions()).toBeInTheDocument();
  });

  it('AC-045: does not repeat the empty-state actions in the header', async () => {
    granted = [...WRITER, 'tasks:write'];
    projects.list.mockResolvedValue([]);
    renderPage();

    expect(await screen.findByText('No projects yet')).toBeInTheDocument();
    expect(within(await pageHeader()).queryByRole('group', { name: 'Project actions' })).not.toBeInTheDocument();
    const actions = screen.getByRole('group', { name: 'Project actions' });
    expect(within(actions).getByRole('button', { name: 'New project' })).toBeInTheDocument();
    expect(within(actions).getByRole('button', { name: 'Create with AI' })).toBeInTheDocument();
  });

  it('AC-045: gives the empty state only the actions allowed by permission', async () => {
    granted = [...WRITER];
    projects.list.mockResolvedValue([]);
    renderPage();

    expect(await screen.findByText('No projects yet')).toBeInTheDocument();
    const actions = screen.getByRole('group', { name: 'Project actions' });
    expect(within(actions).getByRole('button', { name: 'New project' })).toBeInTheDocument();
    expect(within(actions).queryByRole('button', { name: 'Create with AI' })).not.toBeInTheDocument();
  });

  it('AC-045: hides every creation action from read-only members', async () => {
    granted = ['projects:read'];
    projects.list.mockResolvedValue([]);
    renderPage();

    expect(await screen.findByText('No projects yet')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Project actions' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New project' })).not.toBeInTheDocument();
  });

  it('AC-046: groups the header actions, stacks them below sm and keeps 40px targets', async () => {
    granted = [...WRITER, 'tasks:write'];
    renderPage();
    await screen.findByRole('link', { name: 'Website' });

    const header = await pageHeader();
    expect(header.className).toContain('flex-col');
    expect(header.className).toContain('sm:flex-row');

    const actions = within(header).getByRole('group', { name: 'Project actions' });
    expect(actions.className).toContain('w-full');
    expect(actions.className).toContain('sm:w-auto');
    expect(actions.className).toContain('flex-col');
    expect(actions.className).toContain('sm:flex-row');
    for (const button of within(actions).getAllByRole('button')) {
      expect(button.className).toContain('h-10');
    }
  });

  it('AC-046: translates the header actions and works RTL', async () => {
    granted = [...WRITER, 'tasks:write'];
    await i18n.changeLanguage('fr');
    renderPage();
    await screen.findByRole('link', { name: 'Website' });

    const frActions = within(await pageHeader('Projets')).getByRole('group', { name: 'Actions du projet' });
    expect(within(frActions).getByRole('button', { name: 'Nouveau projet' })).toBeInTheDocument();
    expect(within(frActions).getByRole('button', { name: 'Créer avec l’IA' })).toBeInTheDocument();

    await i18n.changeLanguage('ar');
    const arActions = within(await pageHeader('المشاريع')).getByRole('group', { name: 'إجراءات المشروع' });
    expect(within(arActions).getByRole('button', { name: 'مشروع جديد' })).toBeInTheDocument();
    expect(within(arActions).getByRole('button', { name: 'إنشاء بالذكاء الاصطناعي' })).toBeInTheDocument();
    expect(document.documentElement.dir).toBe('rtl');
  });
});
