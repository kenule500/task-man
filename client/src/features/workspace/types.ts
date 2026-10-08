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
}
