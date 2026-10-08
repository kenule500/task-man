import { createContext } from 'react';
import type { PermissionContextValue } from './permissionTypes';

export const PermissionContext = createContext<PermissionContextValue | undefined>(undefined);