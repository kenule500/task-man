import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { Toaster } from '@/components/ds';
import { viewsApi } from '../api';
import ViewsMenu from '../components/ViewsMenu';
import type { SavedView } from '../types';

jest.setTimeout(60000);

jest.mock('../api', () => ({
  viewsApi: { list: jest.fn(), create: jest.fn(), update: jest.fn(), remove: jest.fn() },
}));

const api = viewsApi as jest.Mocked<typeof viewsApi>;

const make = (overrides: Partial<SavedView> = {}): SavedView => ({
  _id: 'v1', name: 'My bugs', view: 'list', query: 'type=bug&assignedToMe=1', shared: false, mine: true,
  owner: { _id: 'u1', name: 'Ada Lovelace' }, ...overrides,
});

const mineView = make();
const sharedView = make({ _id: 'v2', name: 'Team board', view: 'board', query: 'priority=high', shared: true, mine: false, owner: { _id: 'u2', name: 'Grace Hopper' } });

const Where = () => {
  const location = useLocation();
  return <output data-testid="where">{location.pathname + location.search}</output>;
};

const renderMenu = (props: { canManageShared?: boolean; url?: string } = {}) => {
  const url = props.url ?? '/acme/tasks?view=list&status=pending';
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route
          path="*"
          element={<><ViewsMenu slug="acme" layout="list" params={new URLSearchParams(new URL(url, 'http://x').search)} canManageShared={props.canManageShared} /><Where /></>}
        />
      </Routes>
      <Toaster />
    </MemoryRouter>,
  );
};

const openMenu = async () => {
  await userEvent.click(screen.getByRole('button', { name: 'Views' }));
  return screen.findByRole('menu');
};

describe('ViewsMenu', () => {
  beforeEach(() => {
    api.list.mockResolvedValue([mineView, sharedView]);
  });

  it('lists my views and the shared ones in separate groups', async () => {
    renderMenu();
    const menu = within(await openMenu());
    await menu.findByRole('menuitem', { name: /My bugs/ });

    expect(menu.getByText('Mine')).toBeInTheDocument();
    expect(menu.getByText('Shared')).toBeInTheDocument();
    // Shared views name their owner
    expect(menu.getByRole('menuitem', { name: /Team board/ })).toHaveTextContent('Grace Hopper');
    expect(api.list).toHaveBeenCalledWith('acme');
  });

  it('opens a view with its layout and filters', async () => {
    renderMenu();
    const menu = within(await openMenu());
    await userEvent.click(await menu.findByRole('menuitem', { name: /Team board/ }));
    expect(screen.getByTestId('where')).toHaveTextContent('/acme/tasks?view=board&priority=high');
  });

  it('marks the view that is already open', async () => {
    renderMenu({ url: '/acme/tasks?view=list&type=bug&assignedToMe=1' });
    const menu = within(await openMenu());
    expect(await menu.findByRole('menuitem', { name: /My bugs.*current view/ })).toBeInTheDocument();
    expect(menu.getByRole('menuitem', { name: /Team board/ })).not.toHaveTextContent('current view');
  });

  it('explains an empty list', async () => {
    api.list.mockResolvedValue([]);
    renderMenu();
    const menu = within(await openMenu());
    expect(await menu.findByText(/no saved views yet/i)).toBeInTheDocument();
    expect(menu.queryByRole('menuitem', { name: /manage views/i })).not.toBeInTheDocument();
  });

  it('saves the current layout and filters under a name, optionally shared', async () => {
    api.create.mockResolvedValue(make({ _id: 'v3', name: 'Pending ones', query: 'status=pending', shared: true }));
    renderMenu();
    await userEvent.click(within(await openMenu()).getByRole('menuitem', { name: /save current view/i }));

    const dialog = within(await screen.findByRole('dialog', { name: 'Save current view' }));
    expect(dialog.getByText(/List · status pending/)).toBeInTheDocument();

    // A name is required
    await userEvent.click(dialog.getByRole('button', { name: 'Save view' }));
    expect(await dialog.findByText('Give the view a name.')).toBeInTheDocument();
    expect(api.create).not.toHaveBeenCalled();

    await userEvent.type(dialog.getByRole('textbox', { name: /name/i }), 'Pending ones');
    await userEvent.click(dialog.getByRole('checkbox', { name: /share with the workspace/i }));
    await userEvent.click(dialog.getByRole('button', { name: 'Save view' }));

    await waitFor(() => expect(api.create).toHaveBeenCalledWith('acme', {
      name: 'Pending ones', view: 'list', query: 'status=pending', shared: true,
    }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Save current view' })).not.toBeInTheDocument());
    expect(await screen.findByText('Saved view “Pending ones”')).toBeInTheDocument();
  });

  it('keeps the dialog open and says what went wrong when saving fails', async () => {
    api.create.mockRejectedValue(new Error('boom'));
    renderMenu();
    await userEvent.click(within(await openMenu()).getByRole('menuitem', { name: /save current view/i }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Save current view' }));
    await userEvent.type(dialog.getByRole('textbox', { name: /name/i }), 'Broken');
    await userEvent.click(dialog.getByRole('button', { name: 'Save view' }));
    expect(await dialog.findByText(/we could not save this view/i)).toBeInTheDocument();
  });

  it('renames a view from Manage views', async () => {
    api.update.mockResolvedValue({ ...mineView, name: 'Open bugs' });
    renderMenu();
    await userEvent.click(await within(await openMenu()).findByRole('menuitem', { name: /manage views/i }));

    const manage = within(await screen.findByRole('dialog', { name: 'Manage views' }));
    // Only my own view is editable for a normal member
    expect(manage.queryByRole('button', { name: /Edit Team board/ })).not.toBeInTheDocument();
    await userEvent.click(manage.getByRole('button', { name: 'Edit My bugs' }));

    const edit = within(await screen.findByRole('dialog', { name: 'Edit view' }));
    const name = edit.getByRole('textbox', { name: /name/i });
    await userEvent.clear(name);
    await userEvent.type(name, 'Open bugs');
    await userEvent.click(edit.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(api.update).toHaveBeenCalledWith('acme', 'v1', { name: 'Open bugs', shared: false }));
  });

  it('deletes a view after confirming', async () => {
    api.remove.mockResolvedValue(undefined);
    renderMenu();
    await userEvent.click(await within(await openMenu()).findByRole('menuitem', { name: /manage views/i }));
    const manage = within(await screen.findByRole('dialog', { name: 'Manage views' }));
    await userEvent.click(manage.getByRole('button', { name: 'Delete My bugs' }));

    const confirm = within(await screen.findByRole('alertdialog'));
    expect(confirm.getByText(/“My bugs” will be removed/)).toBeInTheDocument();
    expect(api.remove).not.toHaveBeenCalled();
    await userEvent.click(confirm.getByRole('button', { name: 'Delete view' }));

    await waitFor(() => expect(api.remove).toHaveBeenCalledWith('acme', 'v1'));
    expect(await screen.findByText('Deleted view “My bugs”')).toBeInTheDocument();
  });

  it('lets people who manage the workspace edit shared views too, but not rename-share them', async () => {
    renderMenu({ canManageShared: true });
    await userEvent.click(await within(await openMenu()).findByRole('menuitem', { name: /manage views/i }));
    const manage = within(await screen.findByRole('dialog', { name: 'Manage views' }));
    await userEvent.click(manage.getByRole('button', { name: 'Edit Team board' }));

    const edit = within(await screen.findByRole('dialog', { name: 'Edit view' }));
    // Only the owner decides who sees a view
    expect(edit.queryByRole('checkbox', { name: /share with the workspace/i })).not.toBeInTheDocument();
  });
});
