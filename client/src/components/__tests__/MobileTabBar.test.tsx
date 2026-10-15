import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { PermissionContext } from '@/context/PermissionContext';
import type { PermissionContextValue } from '@/context/permissionTypes';
import MobileTabBar from '../MobileTabBar';

const setOpenMobile = jest.fn();
jest.mock('@/components/ui/sidebar', () => ({ useSidebar: () => ({ setOpenMobile }) }));

const permissionValue = (granted: string[], loading = false): PermissionContextValue => ({
  user: null,
  workspace: null,
  role: null,
  permissions: granted,
  actions: [],
  loading,
  error: null,
  can: permission => granted.includes(permission),
  hasRole: () => false,
  refresh: async () => undefined,
});

const Where = () => {
  const location = useLocation();
  return <output data-testid="where">{location.pathname + location.search}</output>;
};

const renderBar = (granted: string[], path = '/acme/tasks', slug = 'acme', loading = false) =>
  render(
    <PermissionContext.Provider value={permissionValue(granted, loading)}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="*" element={<><MobileTabBar slug={slug} /><Where /></>} />
        </Routes>
      </MemoryRouter>
    </PermissionContext.Provider>,
  );

const ALL = ['tasks:read', 'tasks:write', 'projects:read'];

describe('MobileTabBar', () => {
  it('renders the five slots in a labelled navigation', () => {
    renderBar(ALL);
    const nav = screen.getByRole('navigation', { name: 'Primary' });
    expect(nav).toHaveClass('md:hidden');
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/acme/dashboard');
    expect(screen.getByRole('link', { name: 'Tasks' })).toHaveAttribute('href', '/acme/tasks');
    expect(screen.getByRole('link', { name: 'New task' })).toHaveAttribute('href', '/acme/tasks?new=1');
    expect(screen.getByRole('link', { name: 'Projects' })).toHaveAttribute('href', '/acme/projects');
    expect(screen.getByRole('button', { name: 'More' })).toBeInTheDocument();
  });

  it('marks only the current page', () => {
    renderBar(ALL, '/acme/projects');
    expect(screen.getByRole('link', { name: 'Projects' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Tasks' })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current');
  });

  it('hides slots the user may not use but keeps the layout slots', () => {
    renderBar(['tasks:read']);
    expect(screen.getByRole('link', { name: 'Tasks' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'New task' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Projects' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(5);
  });

  it('hides gated slots while permissions load', () => {
    renderBar(ALL, '/acme/tasks', 'acme', true);
    expect(screen.queryByRole('link', { name: 'Tasks' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Home' })).toBeInTheDocument();
  });

  it('opens the sidebar sheet from More', async () => {
    renderBar(ALL);
    await userEvent.click(screen.getByRole('button', { name: 'More' }));
    expect(setOpenMobile).toHaveBeenCalledWith(true);
  });

  it('navigates to the create-task link', async () => {
    renderBar(ALL, '/acme/dashboard');
    await userEvent.click(screen.getByRole('link', { name: 'New task' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/acme/tasks?new=1');
  });

  it('renders nothing without a workspace', () => {
    renderBar(ALL, '/settings/profile', '');
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });
});
