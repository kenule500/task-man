import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RolePermissionMatrix from '../RolePermissionMatrix';
import { filterRoles, sortRoles, sortedGroups, countMembersByRole, type RbacRole } from '../settings/rbac';

const catalog = {
  Settings: [{ key: 'settings:manage', label: 'Change workspace settings' }],
  Tasks: [
    { key: 'tasks:read', label: 'View tasks' },
    { key: 'tasks:write', label: 'Create/edit tasks' },
  ],
  Projects: [{ key: 'projects:read', label: 'View projects' }],
};

const role = (over: Partial<RbacRole> & { name: string }): RbacRole => ({
  _id: over.name,
  description: '',
  permissions: [],
  isSystem: true,
  ...over,
});

const roles: RbacRole[] = [
  role({ name: 'Viewer', permissions: ['projects:read', 'tasks:read'] }),
  role({ name: 'Product Owner', permissions: ['projects:read', 'tasks:read', 'tasks:write', 'settings:manage'] }),
  role({ name: 'Auditor', isSystem: false, permissions: ['tasks:read'] }),
  role({ name: 'Developer', permissions: ['tasks:read', 'tasks:write'] }),
];

const cellOf = (rowLabel: string, columnName: string) => {
  const table = screen.getByRole('table');
  const columnIndex = within(table)
    .getAllByRole('columnheader')
    .findIndex((header) => within(header).queryByText(columnName));
  const row = within(table).getByRole('row', { name: new RegExp(rowLabel) });
  return within(row).getAllByRole('cell')[columnIndex - 1];
};

describe('RolePermissionMatrix', () => {
  it('labels the scroll region and makes it keyboard reachable with sticky, scrollable layout', () => {
    render(<RolePermissionMatrix roles={roles} catalog={catalog} />);

    const region = screen.getByRole('region', { name: 'Permission matrix' });
    expect(region).toHaveAttribute('tabindex', '0');
    expect(region).toHaveClass('overflow-auto', 'max-h-[60dvh]', '[scrollbar-width:thin]', '[scrollbar-gutter:stable]');
    expect(region.className).toContain('focus-visible:ring-2');

    const table = within(region).getByRole('table');
    expect(table.querySelector('caption')).toHaveClass('sr-only');
    screen.getAllByRole('columnheader').forEach((header) => expect(header).toHaveClass('sticky', 'top-0'));
    screen.getAllByRole('rowheader').forEach((header) => expect(header).toHaveClass('sticky', 'left-0'));
  });

  it('orders columns as system roles by rank, then custom roles, and rows by permission group', () => {
    render(<RolePermissionMatrix roles={roles} catalog={catalog} />);

    const headers = screen.getAllByRole('columnheader').map((header) => header.textContent ?? '');
    const order = ['Product Owner', 'Developer', 'Viewer', 'Auditor'].map((name) =>
      headers.findIndex((text) => text.includes(name)),
    );
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(order.every((index) => index > 0)).toBe(true);

    const groupRows = screen.getAllByRole('rowheader').map((header) => header.textContent);
    expect(groupRows.indexOf('Projects')).toBeLessThan(groupRows.indexOf('Tasks'));
    expect(groupRows.indexOf('Tasks')).toBeLessThan(groupRows.indexOf('Settings'));
  });

  it('marks each cell as Allowed or Not allowed for screen readers', () => {
    render(<RolePermissionMatrix roles={roles} catalog={catalog} />);

    expect(within(cellOf('Create/edit tasks', 'Developer')).getByText('Allowed')).toBeInTheDocument();
    expect(within(cellOf('Create/edit tasks', 'Viewer')).getByText('Not allowed')).toBeInTheDocument();
    expect(within(cellOf('Change workspace settings', 'Product Owner')).getByText('Allowed')).toBeInTheDocument();
    expect(within(cellOf('Change workspace settings', 'Auditor')).getByText('Not allowed')).toBeInTheDocument();

    // 4 roles x 4 permissions
    expect(screen.getAllByText(/^(Allowed|Not allowed)$/)).toHaveLength(16);
  });

  it('shows System tags and member counts in the column headers', () => {
    render(
      <RolePermissionMatrix roles={roles} catalog={catalog} memberCounts={{ Developer: 3, Auditor: 1 }} />,
    );

    expect(screen.getAllByText('System')).toHaveLength(3);
    expect(screen.getByText('3 members')).toBeInTheDocument();
    expect(screen.getByText('1 member')).toBeInTheDocument();
  });

  it('offers Edit only on custom role headers and only when the user can manage', async () => {
    const onEditRole = jest.fn();
    const { rerender } = render(
      <RolePermissionMatrix roles={roles} catalog={catalog} canManage onEditRole={onEditRole} />,
    );

    expect(screen.getAllByRole('button')).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: 'Edit role Auditor' }));
    expect(onEditRole).toHaveBeenCalledWith(expect.objectContaining({ name: 'Auditor' }));

    rerender(<RolePermissionMatrix roles={roles} catalog={catalog} onEditRole={onEditRole} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('rbac helpers', () => {
  it('sorts system roles by rank before custom roles', () => {
    expect(sortRoles(roles).map((r) => r.name)).toEqual(['Product Owner', 'Developer', 'Viewer', 'Auditor']);
  });

  it('orders permission groups canonically and skips empty ones', () => {
    expect(sortedGroups({ ...catalog, Empty: [] }).map(([group]) => group)).toEqual(['Projects', 'Tasks', 'Settings']);
  });

  it('filters roles by name or description', () => {
    const list = [role({ name: 'Auditor', description: 'Read only' }), role({ name: 'Lead' })];
    expect(filterRoles(list, ' aud ')).toHaveLength(1);
    expect(filterRoles(list, 'read')).toHaveLength(1);
    expect(filterRoles(list, '')).toHaveLength(2);
  });

  it('counts members by populated or bare role id', () => {
    expect(countMembersByRole([{ roleId: { _id: 'a' } }, { roleId: 'a' }, { roleId: 'b' }, { roleId: null }])).toEqual({
      a: 2,
      b: 1,
    });
  });
});
