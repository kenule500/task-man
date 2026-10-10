import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import api from '@/utils/api';
import { PermissionContext } from '@/context/PermissionContext';
import type { PermissionContextValue } from '@/context/permissionTypes';
import CustomFieldsPage from '@/pages/CustomFieldsPage';
import { resetCustomFieldsCache } from '../hooks/useCustomFields';
import CustomFieldValue from '../components/CustomFieldValue';
import TaskCustomFields from '../components/TaskCustomFields';
import TaskCustomChips from '../components/TaskCustomChips';
import type { CustomField } from '../types';

jest.mock('@/utils/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), put: jest.fn(), delete: jest.fn() },
  getApiErrorMessage: (_error: unknown, fallback: string) => fallback,
}));

jest.mock('@/features/tasks/hooks/useWorkspaceMembers', () => ({
  useWorkspaceMembers: () => ({ members: [], loading: false }),
}));

jest.setTimeout(30000);

const mockedApi = api as jest.Mocked<typeof api>;

const make = (over: Partial<CustomField> & Pick<CustomField, 'key' | 'type'>): CustomField => ({
  _id: over.key, name: over.key, options: [], projects: [], required: false, order: 1, archived: false, ...over,
});

const FIELDS: CustomField[] = [
  make({
    key: 'size', type: 'select', name: 'Size', order: 1,
    options: [{ id: 'sm01', label: 'Small', color: 'emerald' }, { id: 'lg01', label: 'Large', color: 'rose' }],
  }),
  make({ key: 'memo', type: 'text', name: 'Memo', order: 2 }),
  make({ key: 'blocked', type: 'checkbox', name: 'Blocked', order: 3 }),
  make({ key: 'budget', type: 'number', name: 'Budget', order: 4, projects: ['Web'] }),
  make({ key: 'spec', type: 'url', name: 'Spec', order: 5 }),
];

const permissions = (can: (permission: string) => boolean): PermissionContextValue => ({
  user: null, workspace: null, role: null, permissions: [], actions: [], loading: false, error: null,
  can, hasRole: () => false, refresh: async () => undefined,
});

const renderAt = (ui: React.ReactElement, can: (permission: string) => boolean = () => true) =>
  render(
    <PermissionContext.Provider value={permissions(can)}>
      <MemoryRouter initialEntries={['/acme/settings/fields']}>
        <Routes>
          <Route path="/:workspaceSlug/settings/fields" element={ui} />
        </Routes>
      </MemoryRouter>
    </PermissionContext.Provider>,
  );

beforeEach(() => {
  resetCustomFieldsCache();
  Object.values(mockedApi).forEach(mock => (mock as jest.Mock).mockReset());
  mockedApi.get.mockImplementation(async (url: string) => {
    if (url.endsWith('/fields')) return { data: FIELDS };
    throw { response: { status: 404 } };
  });
});

describe('CustomFieldValue', () => {
  it('shows options as chips, links safely and booleans as words', () => {
    const [size, , blocked] = FIELDS;
    render(
      <>
        <CustomFieldValue field={size} value="lg01" />
        <CustomFieldValue field={blocked} value />
        <CustomFieldValue field={FIELDS[4]} value="https://example.com/spec" />
        <CustomFieldValue field={FIELDS[4]} value="javascript:alert(1)" />
        <CustomFieldValue field={FIELDS[1]} value={undefined} />
      </>,
    );
    expect(screen.getByText('Large')).toBeInTheDocument();
    expect(screen.getByText('Yes')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /example\.com\/spec/ });
    expect(link).toHaveAttribute('href', 'https://example.com/spec');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(screen.getByText('javascript:alert(1)')).toBeInTheDocument();
    expect(screen.getByText('Not set')).toBeInTheDocument();
  });
});

describe('TaskCustomFields', () => {
  it('lists the fields of the task project and saves a text value on blur', async () => {
    const onChange = jest.fn().mockResolvedValue({});
    renderAt(<TaskCustomFields task={{ project: '', custom: { memo: 'old' } }} workspaceSlug="acme" canWrite onChange={onChange} />);

    const memo = await screen.findByLabelText('Memo');
    // Budget applies to project "Web" only
    expect(screen.queryByLabelText('Budget')).not.toBeInTheDocument();
    expect(memo).toHaveValue('old');

    const user = userEvent.setup();
    await user.clear(memo);
    await user.type(memo, 'new note');
    await user.tab();
    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ memo: 'new note' }));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('clears a value with null and saves a switch at once', async () => {
    const onChange = jest.fn().mockResolvedValue({});
    renderAt(<TaskCustomFields task={{ project: 'Web', custom: { memo: 'old', budget: 5 } }} workspaceSlug="acme" canWrite onChange={onChange} />);

    const memo = await screen.findByLabelText('Memo');
    expect(await screen.findByLabelText('Budget')).toHaveValue(5);
    const user = userEvent.setup();
    await user.clear(memo);
    await user.tab();
    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ memo: null }));

    await user.click(screen.getByRole('switch', { name: 'Blocked' }));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ blocked: true }));
  });

  it('is read-only without write access', async () => {
    renderAt(<TaskCustomFields task={{ project: '', custom: { size: 'sm01' } }} workspaceSlug="acme" canWrite={false} onChange={jest.fn()} />);
    expect(await screen.findByText('Small')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  });

  it('renders nothing when the workspace has no fields', async () => {
    mockedApi.get.mockResolvedValue({ data: [] });
    const { container } = renderAt(<TaskCustomFields task={{ project: '' }} workspaceSlug="acme" canWrite onChange={jest.fn()} />);
    await waitFor(() => expect(mockedApi.get).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});

describe('TaskCustomChips', () => {
  it('shows chips for filled values only and sums up the rest', async () => {
    renderAt(<TaskCustomChips max={2} task={{ project: 'Web', custom: { size: 'lg01', memo: 'hello', budget: 3, blocked: false } }} />);
    const list = await screen.findByRole('list', { name: 'Custom fields' });
    const items = within(list).getAllByRole('listitem');
    expect(items.map(item => item.textContent)).toEqual(['Size:Large', 'Memo:hello', '+1']);
  });
});

describe('CustomFieldsPage', () => {
  it('lists fields with their types and projects', async () => {
    renderAt(<CustomFieldsPage />);
    const list = await screen.findByRole('list', { name: 'Custom fields' });
    expect(within(list).getAllByRole('listitem', { name: /field \d of 5/ })).toHaveLength(5);
    expect(within(list).getByText('Large')).toBeInTheDocument();
    expect(within(list).getByText('Web')).toBeInTheDocument();
  });

  it('is limited to people who manage settings', async () => {
    renderAt(<CustomFieldsPage />, permission => permission !== 'settings:manage');
    expect(await screen.findByText(/Only people who manage settings/)).toBeInTheDocument();
  });

  it('creates a select field with options', async () => {
    mockedApi.post.mockResolvedValue({ data: make({ key: 'risk', type: 'select', name: 'Risk', order: 6, options: [{ id: 'ab12', label: 'High', color: 'slate' }] }) });
    renderAt(<CustomFieldsPage />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'New field' }));
    const dialog = await screen.findByRole('dialog');

    // Validation first: an empty form says what is missing
    await user.click(within(dialog).getByRole('button', { name: 'Create field' }));
    expect(await within(dialog).findByText('Give the field a name.')).toBeInTheDocument();
    expect(mockedApi.post).not.toHaveBeenCalled();

    await user.type(within(dialog).getByRole('textbox', { name: /^Name/ }), 'Risk');
    await user.click(within(dialog).getByRole('combobox', { name: 'Field type' }));
    await user.click(await screen.findByRole('option', { name: 'Select' }));
    await user.click(within(dialog).getByRole('button', { name: 'Add option' }));
    await user.type(within(dialog).getByRole('textbox', { name: 'Name of option 1' }), 'High');
    await user.click(within(dialog).getByRole('button', { name: 'Create field' }));

    await waitFor(() => expect(mockedApi.post).toHaveBeenCalledTimes(1));
    const [url, body] = mockedApi.post.mock.calls[0];
    expect(url).toBe('/workspaces/acme/fields');
    expect(body).toMatchObject({ name: 'Risk', type: 'select', projects: [], required: false, options: [{ label: 'High' }] });
  });

  it('asks before deleting and warns that values are removed', async () => {
    mockedApi.delete.mockResolvedValue({ data: {} });
    renderAt(<CustomFieldsPage />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Delete Memo' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(/values tasks hold for it will be removed/)).toBeInTheDocument();
    expect(mockedApi.delete).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Delete field' }));
    await waitFor(() => expect(mockedApi.delete).toHaveBeenCalledWith('/workspaces/acme/fields/memo'));
  });

  it('reorders with the move buttons', async () => {
    const reordered = [FIELDS[1], FIELDS[0], ...FIELDS.slice(2)];
    mockedApi.put.mockResolvedValue({ data: reordered });
    renderAt(<CustomFieldsPage />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Move Memo up' }));
    await waitFor(() => expect(mockedApi.put).toHaveBeenCalledWith('/workspaces/acme/fields/order', { ids: ['memo', 'size', 'blocked', 'budget', 'spec'] }));
  });
});
