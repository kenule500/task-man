import { useCallback, useContext, useMemo } from 'react';
import { PermissionContext } from '@/context/PermissionContext';
import { useWorkspaceMembers } from '@/features/tasks/hooks/useWorkspaceMembers';

export interface FieldMember {
  _id: string;
  name: string;
  avatarUrl?: string;
}

/**
 * Members for person fields. Fetched only when `needed` (some visible field is a person field) and the
 * user may list members; otherwise the list is empty and names fall back to "Member".
 */
export const useFieldMembers = (slug: string | undefined, needed: boolean) => {
  const permissions = useContext(PermissionContext);
  const canList = permissions?.can('users:read') ?? false;
  const { members, loading } = useWorkspaceMembers(slug, needed && canList);

  const list = useMemo<FieldMember[]>(
    () => members.map(member => ({ _id: member._id, name: member.name, avatarUrl: member.avatarUrl || undefined })),
    [members],
  );
  const nameOf = useCallback((id: string) => list.find(member => member._id === id)?.name, [list]);

  return { members: list, loading, canList, nameOf };
};
