import { Fragment, useState, type UIEvent } from 'react';
import { Check, Pencil } from 'lucide-react';
import { Tag } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { sortRoles, sortedGroups, type PermissionCatalog, type RbacRole } from './settings/rbac';

interface RolePermissionMatrixProps {
  roles: RbacRole[];
  catalog: PermissionCatalog;
  /** Members per role id; the count is omitted from the header when not provided. */
  memberCounts?: Record<string, number>;
  /** Shows the Edit button on custom role headers. */
  canManage?: boolean;
  onEditRole?: (role: RbacRole) => void;
  className?: string;
}

const EDGE_SHADOW = 'shadow-[4px_0_6px_-4px_rgba(15,23,42,0.28)]';
const HEADER_SHADOW = 'shadow-[0_4px_6px_-4px_rgba(15,23,42,0.28)]';

/**
 * Permissions (rows, grouped) by roles (columns). Scrolls inside its own region in both
 * directions with a sticky header row and a sticky first column, so the page never scrolls sideways.
 */
const RolePermissionMatrix = ({
  roles,
  catalog,
  memberCounts,
  canManage = false,
  onEditRole,
  className,
}: RolePermissionMatrixProps) => {
  const [scrolled, setScrolled] = useState({ x: false, y: false });

  const columns = sortRoles(roles);
  const groups = sortedGroups(catalog);

  const handleScroll = (event: UIEvent<HTMLDivElement>) => {
    const { scrollLeft, scrollTop } = event.currentTarget;
    const next = { x: scrollLeft > 0, y: scrollTop > 0 };
    setScrolled((current) => (current.x === next.x && current.y === next.y ? current : next));
  };

  return (
    <div
      role="region"
      aria-label="Permission matrix"
      tabIndex={0}
      onScroll={handleScroll}
      data-scrolled-x={scrolled.x}
      data-scrolled-y={scrolled.y}
      className={cn(
        // relative: the absolutely positioned sr-only labels inside must stay in this scroll box, not stretch the page
        'relative max-h-[60dvh] max-w-full overflow-auto overscroll-contain rounded-lg border border-slate-200 bg-white',
        '[scrollbar-width:thin] [scrollbar-gutter:stable]',
        'outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
        className,
      )}
    >
      <table className="w-max min-w-full border-separate border-spacing-0 text-left text-sm">
        <caption className="sr-only">
          Permissions granted to each role. Columns are roles, rows are permissions grouped by area.
        </caption>
        <thead>
          <tr>
            <th
              scope="col"
              className={cn(
                'sticky top-0 left-0 z-30 min-w-40 border-b border-slate-200 bg-slate-50 px-3 py-3 text-xs font-semibold uppercase tracking-wider text-slate-700 transition-shadow motion-reduce:transition-none sm:min-w-56 sm:px-4',
                scrolled.x ? EDGE_SHADOW : scrolled.y && HEADER_SHADOW,
              )}
            >
              Permission
            </th>
            {columns.map((role) => {
              const count = memberCounts?.[role._id];
              return (
                <th
                  key={role._id}
                  scope="col"
                  className={cn(
                    'sticky top-0 z-20 min-w-32 border-b border-slate-200 bg-slate-50 px-3 py-3 text-center align-top font-normal transition-shadow motion-reduce:transition-none',
                    scrolled.y && HEADER_SHADOW,
                  )}
                >
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-sm font-semibold text-slate-900">{role.name}</span>
                    <span className="flex flex-wrap items-center justify-center gap-1">
                      {role.isSystem && <Tag size="sm" className="uppercase tracking-wider">System</Tag>}
                      {count !== undefined && (
                        <span className="text-xs font-normal tabular-nums text-slate-600">
                          {count} member{count !== 1 ? 's' : ''}
                        </span>
                      )}
                    </span>
                    {canManage && !role.isSystem && (
                      <Button
                        variant="ghost"
                        onClick={() => onEditRole?.(role)}
                        aria-label={`Edit role ${role.name}`}
                        className="size-10 rounded-lg text-slate-600 hover:bg-primary/10 hover:text-primary md:size-8"
                      >
                        <Pencil aria-hidden />
                      </Button>
                    )}
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {groups.map(([group, options]) => (
            <Fragment key={group}>
              <tr>
                <th
                  scope="rowgroup"
                  className={cn(
                    'sticky left-0 z-10 border-b border-slate-200 bg-slate-100 px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-700 transition-shadow motion-reduce:transition-none sm:px-4',
                    scrolled.x && EDGE_SHADOW,
                  )}
                >
                  {group}
                </th>
                <td colSpan={columns.length} className="border-b border-slate-200 bg-slate-100" />
              </tr>
              {options.map((option) => (
                <tr key={option.key} className="group/row">
                  <th
                    scope="row"
                    className={cn(
                      'sticky left-0 z-10 border-b border-slate-100 bg-white px-3 py-2.5 text-left font-normal transition-shadow group-hover/row:bg-slate-50 motion-reduce:transition-none sm:px-4',
                      scrolled.x && EDGE_SHADOW,
                    )}
                  >
                    <span className="block text-sm text-slate-800">{option.label}</span>
                    <code className="hidden font-mono text-[11px] text-slate-600 sm:block">{option.key}</code>
                  </th>
                  {columns.map((role) => {
                    const allowed = role.permissions.includes(option.key);
                    return (
                      <td
                        key={role._id}
                        className="border-b border-slate-100 px-3 py-2.5 text-center group-hover/row:bg-slate-50"
                      >
                        {allowed ? (
                          <>
                            <Check className="mx-auto size-4 text-success-fg" aria-hidden />
                            <span className="sr-only">Allowed</span>
                          </>
                        ) : (
                          <>
                            <span aria-hidden className="text-slate-500">&mdash;</span>
                            <span className="sr-only">Not allowed</span>
                          </>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default RolePermissionMatrix;
