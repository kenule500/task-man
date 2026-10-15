export type WorkspaceRole = 'owner' | 'admin' | 'member';

export interface WorkspaceMember {
  _id: string;
  name: string;
  email: string;
  avatarUrl: string;
  jobTitle: string;
  role: WorkspaceRole;
  joinedAt: string;
}

export interface WorkspaceDetails {
  _id: string;
  name: string;
  slug: string;
  inviteCode: string;
  createdAt?: string;
  /** Workspace-wide policy; absent on workspaces saved before it existed */
  security?: { require2fa?: boolean };
}
