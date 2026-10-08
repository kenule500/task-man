import { ReactNode } from 'react';
import { usePermissions } from '../hooks/usePermissions';

interface PermissionGateProps {
  permission: string;
  fallback?: ReactNode;
  children: ReactNode;
}

/**
 * Renders children only if the user has the given permission.
 * Optionally renders a fallback otherwise.
 *
 * Usage:
 *   <PermissionGate permission="tasks:delete">
 *     <DeleteButton />
 *   </PermissionGate>
 */
export const PermissionGate = ({
  permission,
  fallback = null,
  children,
}: PermissionGateProps) => {
  const { can, loading } = usePermissions();

  // While loading, don't flash UI. Could render skeleton if desired.
  if (loading) return null;

  return can(permission) ? <>{children}</> : <>{fallback}</>;
};

export default PermissionGate;