import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { PermissionContext } from '@/context/PermissionContext';
import type { PermissionContextValue } from '@/context/permissionTypes';
import ProjectsProvider from '../context/ProjectsProvider';
import { useProjectDirectory } from '../context/ProjectsContext';
import { projectsApi } from '../api';
import { makeProject } from './fixtures';

jest.mock('../api', () => ({ projectsApi: { list: jest.fn() } }));

const list = projectsApi.list as jest.Mock;

const permissionValue = (granted: string[]): PermissionContextValue => ({
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

const Probe = () => {
  const { projects, byName, loading } = useProjectDirectory();
  return (
    <div>
      <output data-testid="count">{projects.length}</output>
      <output data-testid="loading">{String(loading)}</output>
      <output data-testid="found">{byName('  WEBSITE ')?.key ?? 'none'}</output>
      <output data-testid="missing">{byName('Nope')?.key ?? 'none'}</output>
      <output data-testid="blank">{byName('')?.key ?? 'none'}</output>
    </div>
  );
};

const Nav = ({ to }: { to: string }) => {
  const navigate = useNavigate();
  return <button type="button" onClick={() => navigate(to)}>go</button>;
};

const renderProvider = (granted: string[], path = '/acme/dashboard') =>
  render(
    <PermissionContext.Provider value={permissionValue(granted)}>
      <MemoryRouter initialEntries={[path]}>
        <ProjectsProvider slug="acme">
          <Probe />
          <Nav to="/acme/tasks" />
        </ProjectsProvider>
      </MemoryRouter>
    </PermissionContext.Provider>,
  );

describe('project directory', () => {
  beforeEach(() => {
    list.mockResolvedValue([makeProject({ name: 'Website', key: 'WEB' }), makeProject({ name: 'Mobile', key: 'MOB' })]);
  });

  it('loads the projects once and resolves names case-insensitively', async () => {
    renderProvider(['projects:read']);
    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('2'));
    expect(list).toHaveBeenCalledTimes(1);
    expect(list).toHaveBeenCalledWith('acme');
    expect(screen.getByTestId('found')).toHaveTextContent('WEB');
    expect(screen.getByTestId('missing')).toHaveTextContent('none');
    expect(screen.getByTestId('blank')).toHaveTextContent('none');
  });

  it('does not load anything without projects:read', async () => {
    renderProvider(['tasks:read']);
    await act(async () => undefined);
    expect(list).not.toHaveBeenCalled();
    expect(screen.getByTestId('count')).toHaveTextContent('0');
    expect(screen.getByTestId('loading')).toHaveTextContent('false');
  });

  it('reloads after the user leaves the projects pages', async () => {
    renderProvider(['projects:read'], '/acme/projects');
    await waitFor(() => expect(list).toHaveBeenCalledTimes(1));
    await userEvent.click(screen.getByText('go'));
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
  });

  it('does not reload on navigation elsewhere', async () => {
    renderProvider(['projects:read'], '/acme/dashboard');
    await waitFor(() => expect(list).toHaveBeenCalledTimes(1));
    await userEvent.click(screen.getByText('go'));
    expect(list).toHaveBeenCalledTimes(1);
  });

  it('is empty and safe without a provider', () => {
    render(<Probe />);
    expect(screen.getByTestId('count')).toHaveTextContent('0');
    expect(screen.getByTestId('found')).toHaveTextContent('none');
  });
});
