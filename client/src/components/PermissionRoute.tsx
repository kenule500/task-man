import { ReactNode } from 'react';
import { usePermissions } from '../hooks/usePermissions';
import ForbiddenPage from '../pages/ForbiddenPage';
import { Spinner } from './ds';

interface PermissionRouteProps {
  permission?: string;
  children: ReactNode;
}

/**
 * Route guard. If `permission` is provided and the user lacks it,
 * renders <ForbiddenPage /> instead of the children.
 *
 * If `permission` is undefined, renders children unconditionally
 * (for routes that only require membership).
 */
export const PermissionRoute = ({ permission, children }: PermissionRouteProps) => {
  const { can, loading } = usePermissions();

  // While permissions are loading, show nothing (avoid flashing 403)
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[70vh]">
        <Spinner size="md" label="Checking access" className="text-primary" />
      </div>
    );
  }

  // No permission required → let them through (membership already verified elsewhere)
  if (!permission) {
    return <>{children}</>;
  }

  // Permission check
  if (!can(permission)) {
    return <ForbiddenPage requiredPermission={permission} />;
  }

  return <>{children}</>;
};

export default PermissionRoute;