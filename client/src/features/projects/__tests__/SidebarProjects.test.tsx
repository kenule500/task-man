import type { ReactElement, ReactNode } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import SidebarProjects from '../components/SidebarProjects';
import { ProjectsContext, type ProjectDirectory } from '../context/ProjectsContext';
import { makeProject, makeSprint } from './fixtures';

const sidebarState = { isMobile: false, state: 'expanded', setOpenMobile: jest.fn() };

// The real primitives need matchMedia and a provider; stand-ins keep the markup and the render props.
jest.mock('@/components/ui/sidebar', () => {
  const { cloneElement: clone } = jest.requireActual('react');
  return {
    useSidebar: () => sidebarState,
    SidebarGroup: ({ children, ...rest }: { children: ReactNode }) => <div {...rest}>{children}</div>,
    SidebarGroupLabel: ({ render: element, children }: { render: ReactElement; children: ReactNode }) => clone(element, {}, children),
    SidebarMenu: ({ children, ...rest }: { children: ReactNode }) => <ul {...rest}>{children}</ul>,
    SidebarMenuItem: ({ children }: { children: ReactNode }) => <li>{children}</li>,
    SidebarMenuAction: ({ children, ...rest }: { children: ReactNode }) => <button type="button" {...rest}>{children}</button>,
    SidebarMenuSub: ({ children, ...rest }: { children: ReactNode }) => <ul {...rest}>{children}</ul>,
    SidebarMenuSubItem: ({ children }: { children: ReactNode }) => <li>{children}</li>,
    SidebarMenuSubButton: ({ render: element, isActive }: { render: ReactElement; isActive?: boolean }) =>
      clone(element, { "data-active": isActive ? "true" : undefined }),
    SidebarMenuButton: ({ render: element, isActive, tooltip }: { render: ReactElement; isActive?: boolean; tooltip?: string }) =>
      clone(element, { 'data-active': isActive ? 'true' : undefined, 'data-tooltip': tooltip }),
  };
});

type TestProject = ReturnType<typeof makeProject>;

const directory = (projects: TestProject[]): ProjectDirectory => ({
  slug: 'acme', projects, loading: false, byName: () => undefined, reload: async () => undefined,
});

const renderGroup = (projects: TestProject[], { canRead = true, path = '/acme/dashboard' } = {}) =>
  render(
    <ProjectsContext.Provider value={directory(projects)}>
      <MemoryRouter initialEntries={[path]}>
        <SidebarProjects slug="acme" canRead={canRead} />
      </MemoryRouter>
    </ProjectsContext.Provider>,
  );

const many = (count: number) =>
  Array.from({ length: count }, (_, i) => makeProject({ _id: `p${i}`, name: `Project ${i}`, key: `K${i}` }));

describe('SidebarProjects', () => {
  beforeEach(() => {
    sidebarState.isMobile = false;
    sidebarState.state = 'expanded';
  });

  it('lists at most six active projects with folders and an All projects link', () => {
    renderGroup([...many(8), makeProject({ _id: 'old', name: 'Old one', archived: true })]);
    const links = within(screen.getByTestId('sidebar-projects')).getAllByRole('link');
    expect(links).toHaveLength(7);
    expect(links[0]).toHaveAttribute('href', '/acme/projects/p0');
    expect(within(links[0]).getByTestId('project-folder-icon')).toBeInTheDocument();
    expect(screen.queryByText('Old one')).not.toBeInTheDocument();
    expect(screen.queryByText('Project 6')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'All projects' })).toHaveAttribute('href', '/acme/projects');
  });

  it('marks the current project as active', () => {
    renderGroup(many(2), { path: '/acme/projects/p1' });
    expect(screen.getByRole('link', { name: 'Project 1' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Project 0' })).not.toHaveAttribute('aria-current');
  });

  it('marks All projects as active on the projects page', () => {
    renderGroup(many(1), { path: '/acme/projects' });
    expect(screen.getByRole('link', { name: 'All projects' })).toHaveAttribute('aria-current', 'page');
  });

  it('hides without projects:read', () => {
    renderGroup(many(2), { canRead: false });
    expect(screen.queryByTestId('sidebar-projects')).not.toBeInTheDocument();
  });

  it('hides when there are no active projects', () => {
    renderGroup([makeProject({ archived: true })]);
    expect(screen.queryByTestId('sidebar-projects')).not.toBeInTheDocument();
  });

  it('collapses and expands from the Projects label', async () => {
    renderGroup(many(2));
    const toggle = screen.getByRole('button', { name: 'Projects' });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('link', { name: 'Project 0' })).not.toBeInTheDocument();
    await userEvent.click(toggle);
    expect(screen.getByRole('link', { name: 'Project 0' })).toBeInTheDocument();
  });

  it('keeps the folders listed in the icon rail, with tooltips', async () => {
    sidebarState.state = 'collapsed';
    renderGroup(many(2));
    await userEvent.click(screen.getByRole('button', { name: 'Projects' }));
    expect(screen.getByRole('link', { name: 'Project 0' })).toHaveAttribute('data-tooltip', 'Project 0');
  });

  describe('project links', () => {
    const sprinting = () => makeProject({
      _id: 'p1', name: 'Web app',
      sprints: [makeSprint({ _id: 's1', project: 'p1', status: 'active' })],
    });

    it('hides the links until the chevron is pressed, then lists them', async () => {
      renderGroup([sprinting()]);
      const chevron = screen.getByRole('button', { name: 'Show Web app links' });
      expect(chevron).toHaveAttribute('aria-expanded', 'false');
      expect(screen.queryByRole('link', { name: 'Backlog' })).not.toBeInTheDocument();
      await userEvent.click(chevron);
      expect(screen.getByRole('button', { name: 'Hide Web app links' })).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getByRole('link', { name: 'Active sprint board' })).toHaveAttribute('href', '/acme/tasks?view=board&project=Web+app&sprint=active');
      expect(screen.getByRole('link', { name: 'Backlog' })).toHaveAttribute('href', '/acme/projects/p1?tab=backlog');
      expect(screen.getByRole('link', { name: 'Epics' })).toHaveAttribute('href', '/acme/projects/p1?tab=epics');
    });

    it('leaves out the board link when no sprint is running', async () => {
      renderGroup([makeProject({ _id: 'p1', name: 'Web app' })]);
      await userEvent.click(screen.getByRole('button', { name: 'Show Web app links' }));
      expect(screen.queryByRole('link', { name: 'Active sprint board' })).not.toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Epics' })).toBeInTheDocument();
    });

    it('starts open on the project being viewed and marks the current link', () => {
      renderGroup([sprinting()], { path: '/acme/projects/p1?tab=epics' });
      expect(screen.getByRole('link', { name: 'Epics' })).toHaveAttribute('aria-current', 'page');
      expect(screen.getByRole('link', { name: 'Backlog' })).not.toHaveAttribute('aria-current');
    });
  });

  it('closes the mobile sheet after navigating', async () => {
    sidebarState.isMobile = true;
    renderGroup(many(1));
    await userEvent.click(screen.getByRole('link', { name: 'Project 0' }));
    expect(sidebarState.setOpenMobile).toHaveBeenCalledWith(false);
  });
});
