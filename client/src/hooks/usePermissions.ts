import { useContext } from 'react';
import { PermissionContext } from '../context/PermissionContext';
import type { PermissionContextValue } from '../context/permissionTypes';

export const usePermissions = (): PermissionContextValue => {
  const ctx = useContext(PermissionContext);
  if (!ctx) {
    throw new Error('usePermissions must be used within a PermissionProvider');
  }
  return ctx;
};