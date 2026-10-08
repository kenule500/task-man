export interface CurrentUser {
  _id: string;
  name: string;
  email: string;
  activeWorkspace?: string;
  activeWorkspaceSlug?: string;
  workspaces?: string[];
}

export interface CurrentWorkspace {
  _id: string;
  name: string;
  slug: string;
}

export interface CurrentRole {
  _id: string;
  name: string;
  description: string;
}

export interface PermissionContextValue {
  user: CurrentUser | null;
  workspace: CurrentWorkspace | null;
  role: CurrentRole | null;
  permissions: string[];
  actions: string[];
  loading: boolean;
  error: string | null;
  can: (permission: string) => boolean;
  hasRole: (roleName: string) => boolean;
  refresh: () => Promise<void>;
}