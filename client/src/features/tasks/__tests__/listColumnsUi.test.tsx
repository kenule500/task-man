import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import api from '@/utils/api';
import { resetCustomFieldsCache } from '@/features/fields/hooks/useCustomFields';
import type { CustomField } from '@/features/fields/types';
import ListView from '../views/ListView';
import type { TaskViewProps } from '../views/types';
import { makeTask } from './fixtures';

jest.mock('@/utils/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), put: jest.fn(), delete: jest.fn() },
  getApiErrorMessage: (_error: unknown, fallback: string) => fallback,
}));

jest.setTimeout(60000);

const mockedApi = api as jest.Mocked<typeof api>;

const make = (over: Partial<CustomField> & Pick<CustomField, 'key' | 'type'>): CustomField => ({
  _id: over.key, name: over.key, options: [], projects: [], required: false, order: 1, archived: false, ...over,
});

const FIELDS: CustomField[] = [
  make({ key: 'size', type: 'select', name: 'Size', order: 1, options: [{ id: 'lg01', label: 'Large', color: 'rose' }] }),
  make({ key: 'budget', type: 'number', name: 'Budget', order: 2 }),
];

const props = (): Omit<TaskViewProps, 'tasks'> => ({
  onUpdate: jest.fn().mockResolvedValue(null),
  onEdit: jest.fn(),
  onDelete: jest.fn(),
  onCreate: jest.fn(),
});

const tasks = () => [
  makeTask({ _id: 'a', title: 'Alpha', custom: { size: 'lg01', budget: 30 }, storyPoints: 8 }),
  makeTask({ _id: 'b', title: 'Beta', custom: { budget: 5 } }),
  makeTask({ _id: 'c', title: 'Gamma' }),
];

const renderList = (slug = 'acme') =>
  render(
    <MemoryRouter initialEntries={[`/${slug}/tasks`]}>
      <Routes>
        <Route path="/:workspaceSlug/tasks" element={<ListView tasks={tasks()} totalCount={3} {...props()} />} />
      </Routes>
    </MemoryRouter>,
  );

const table = () => within(screen.getByTestId('list-table'));
const headers = () => table().getAllByRole('columnheader').map(header => header.textContent ?? '');
const rowTitles = () =>
  table().getAllByRole('row').slice(1).map(row => within(row).getByRole('button', { name: /^(Alpha|Beta|Gamma)$/ }).textContent);

const openMenu = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(table().getByRole('button', { name: 'Columns' }));
  return screen.findByRole('menu');
};

beforeEach(() => {
  localStorage.clear();
  resetCustomFieldsCache();
  Object.values(mockedApi).forEach(mock => (mock as jest.Mock).mockReset());
  mockedApi.get.mockImplementation(async (url: string) => {
    if (url.endsWith('/fields')) return { data: FIELDS };
    return { data: [] };
  });
});

describe('List view columns', () => {
  it('shows the default columns and offers the rest in the Columns menu', async () => {
    const user = userEvent.setup();
    renderList();
    expect(headers().join('|')).toContain('Assignees');
    expect(headers().join('|')).not.toContain('Points');
    expect(headers().join('|')).not.toContain('Size');

    const menu = within(await openMenu(user));
    expect(menu.getByRole('menuitemcheckbox', { name: 'Assignees' })).toBeChecked();
    expect(menu.getByRole('menuitemcheckbox', { name: 'Story points' })).not.toBeChecked();
    expect(await menu.findByRole('menuitemcheckbox', { name: 'Size' })).not.toBeChecked();
    expect(menu.getByRole('menuitemcheckbox', { name: 'Budget' })).toBeInTheDocument();
  });

  it('adds a custom field column with its values and remembers the choice per workspace', async () => {
    const user = userEvent.setup();
    const { unmount } = renderList();
    const menu = within(await openMenu(user));
    await user.click(await menu.findByRole('menuitemcheckbox', { name: 'Size' }));

    await waitFor(() => expect(headers().join('|')).toContain('Size'));
    expect(table().getAllByText('Large').length).toBeGreaterThan(0);
    expect(JSON.parse(localStorage.getItem('taskman.listColumns.acme') ?? 'null')).toEqual(['assignees', 'priority', 'status', 'dueDate', 'cf:size']);
    expect(localStorage.getItem('taskman.listColumns.other')).toBeNull();

    // A fresh mount reads the saved choice
    unmount();
    renderList();
    await waitFor(() => expect(headers().join('|')).toContain('Size'));
  });

  it('hides a built-in column and resets to the defaults', async () => {
    const user = userEvent.setup();
    renderList();
    let menu = within(await openMenu(user));
    await user.click(menu.getByRole('menuitemcheckbox', { name: 'Priority' }));
    await waitFor(() => expect(headers().join('|')).not.toContain('Priority'));

    await user.keyboard('{Escape}');
    menu = within(await openMenu(user));
    await user.click(menu.getByRole('menuitem', { name: 'Reset to default' }));
    await waitFor(() => expect(headers().join('|')).toContain('Priority'));
    expect(localStorage.getItem('taskman.listColumns.acme')).toBeNull();
  });

  it('shows story points in a column instead of the meta line', async () => {
    const user = userEvent.setup();
    renderList();
    expect(table().getByRole('img', { name: '8 story points' })).toBeInTheDocument();
    const menu = within(await openMenu(user));
    await user.click(menu.getByRole('menuitemcheckbox', { name: 'Story points' }));
    await waitFor(() => expect(headers().join('|')).toContain('Points'));
    // One badge: in the column, no longer under the title
    expect(table().getAllByRole('img', { name: '8 story points' })).toHaveLength(1);
  });

  it('sorts rows by a number column and clears the sort on the third click', async () => {
    const user = userEvent.setup();
    renderList();
    const menu = within(await openMenu(user));
    await user.click(await menu.findByRole('menuitemcheckbox', { name: 'Budget' }));
    await user.keyboard('{Escape}');

    const sorter = await table().findByRole('button', { name: /Budget/ });
    expect(rowTitles()).toEqual(['Alpha', 'Beta', 'Gamma']);
    await user.click(sorter);
    expect(table().getByRole('columnheader', { name: /Budget/ })).toHaveAttribute('aria-sort', 'ascending');
    expect(rowTitles()).toEqual(['Beta', 'Alpha', 'Gamma']);
    await user.click(sorter);
    expect(table().getByRole('columnheader', { name: /Budget/ })).toHaveAttribute('aria-sort', 'descending');
    expect(rowTitles()).toEqual(['Alpha', 'Beta', 'Gamma']);
    await user.click(sorter);
    expect(table().getByRole('columnheader', { name: /Budget/ })).not.toHaveAttribute('aria-sort');
  });

  it('keeps the card layout for phones without the columns menu', () => {
    renderList();
    expect(screen.getByTestId('list-cards')).toHaveClass('md:hidden');
    expect(screen.getByTestId('list-table')).toHaveClass('hidden', 'md:block', 'overflow-x-auto');
  });
});
