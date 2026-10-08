import {
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import { useLocation } from 'react-router-dom';
import api from '../utils/api';
import { PermissionContext } from './PermissionContext';
import type {
  CurrentUser,
  CurrentWorkspace,
  CurrentRole,
  PermissionContextValue,
} from './permissionTypes';

// ============================================================
// Slug extraction — ignores public routes
// ============================================================

const RESERVED_PREFIXES = [
  'login',
  'signup',
  'verify-email',
  'forgot-password',
  'reset-password',
  'onboarding',
  'join',
  'settings',
  'accept-invite',
];

const extractWorkspaceSlug = (pathname: string): string | null => {
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length < 2) return null;
  const first = parts[0];
  if (RESERVED_PREFIXES.includes(first)) return null;
  return first;
};

// ============================================================
// Provider
// ============================================================

export const PermissionProvider = ({ children }: { children: ReactNode }) => {
  const location = useLocation();
  const workspaceSlug = extractWorkspaceSlug(location.pathname);

  const [user, setUser] = useState<CurrentUser | null>(null);
  const [workspace, setWorkspace] = useState<CurrentWorkspace | null>(null);
  const [role, setRole] = useState<CurrentRole | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [actions, setActions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPermissions = useCallback(async () => {
    const token = localStorage.getItem('token');

    // Logged out OR not in a workspace context — reset everything
    if (!token || !workspaceSlug) {
      setUser(null);
      setWorkspace(null);
      setRole(null);
      setPermissions([]);
      setActions([]);
      setLoading(false);
      setError(null);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await api.get(
        `/auth/currentuser?workspaceSlug=${workspaceSlug}`
      );
      const data = response.data;

      setUser(data.user);
      setWorkspace(data.workspace);
      setRole(data.role);
      setPermissions(data.permissions || []);
      setActions(data.actions || []);
    } catch (err: unknown) {
      const axiosError = err as { response?: { data?: { message?: string } } };
      console.error('Permission fetch failed:', axiosError.response?.data || err);
      setError(axiosError.response?.data?.message || 'Failed to load permissions');
      setPermissions([]);
      setActions([]);
    } finally {
      setLoading(false);
    }
  }, [workspaceSlug]);

  useEffect(() => {
    (async () => {
      await fetchPermissions();
    })();
  }, [fetchPermissions]);

  const can = useCallback(
    (permission: string) => permissions.includes(permission),
    [permissions]
  );

  const hasRole = useCallback(
    (roleName: string) => role?.name === roleName,
    [role]
  );

  const value: PermissionContextValue = {
    user,
    workspace,
    role,
    permissions,
    actions,
    loading,
    error,
    can,
    hasRole,
    refresh: fetchPermissions,
  };

  return (
    <PermissionContext.Provider value={value}>
      {children}
    </PermissionContext.Provider>
  );
};