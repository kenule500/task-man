import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { ChevronDown, Clock, Mail, Shield, Trash2, UserPlus, Users, X, Check } from 'lucide-react';
import InviteMemberModal from '../components/InviteMemberModal';
import ConfirmActionDialog from '../components/ConfirmActionDialog';
import { usePermissions } from '../hooks/usePermissions';
import { Alert, EmptyState, IconTile, PageHeader, Surface, Tag, UserAvatar } from '@/components/ds';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import api, { getApiErrorMessage } from '../utils/api';

interface Member {
  user: { _id: string; name: string; email: string };
  roleId: { _id: string; name: string; description: string };
  joinedAt: string;
}

interface Invitation {
  _id: string;
  email: string;
  roleId: { _id: string; name: string };
  invitedBy: { _id: string; name: string };
  expiresAt: string;
  createdAt: string;
}

interface Role {
  _id: string;
  name: string;
  description: string;
  isSystem: boolean;
}

type PendingConfirm =
  | { kind: 'member'; id: string; name: string }
  | { kind: 'invitation'; id: string; email: string };

/** Long lists scroll inside their card instead of growing the page. */
const LIST_SCROLL =
  'max-h-[60dvh] overflow-y-auto overscroll-contain [scrollbar-width:thin] [scrollbar-gutter:stable] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary';

const formatDate =(iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

interface RoleControlProps {
  member: Member;
  roles: Role[];
  editable: boolean;
  saving: boolean;
  onChange: (roleId: string) => void;
}

/** Role tag, or a menu to change it when the viewer may manage members. */
const RoleControl = ({ member, roles, editable, saving, onChange }: RoleControlProps) => {
  const roleName = member.roleId?.name || 'No role';

  if (!editable) {
    return (
      <Tag tone="neutral">
        <Shield className="size-3" aria-hidden /> {roleName}
      </Tag>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            disabled={saving}
            aria-label={`Change role for ${member.user.name}, currently ${roleName}`}
            className="h-10 gap-1.5 rounded-lg border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 shadow-none md:h-8"
          />
        }
      >
        <Shield className="size-3.5 text-slate-500" aria-hidden />
        {saving ? 'Saving...' : roleName}
        <ChevronDown className="size-3.5 text-slate-500" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Change role</DropdownMenuLabel>
          {roles.map((role) => (
            <DropdownMenuItem
              key={role._id}
              onClick={() => onChange(role._id)}
              className="min-h-10 md:min-h-0"
            >
              <span className="flex-1 truncate">{role.name}</span>
              {member.roleId?._id === role._id && (
                <>
                  <Check className="size-4 text-primary" aria-hidden />
                  <span className="sr-only">(current)</span>
                </>
              )}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

const MembersSkeleton = () => (
  <ul aria-busy="true" aria-label="Loading members" className="divide-y divide-slate-100">
    {[1, 2, 3].map((i) => (
      <li key={i} className="flex items-center gap-3 px-4 py-4 sm:px-6">
        <Skeleton className="size-9 rounded-full bg-slate-200" />
        <div className="space-y-2">
          <Skeleton className="h-3.5 w-40 bg-slate-200" />
          <Skeleton className="h-3 w-56 max-w-full bg-slate-200" />
        </div>
      </li>
    ))}
  </ul>
);

const TeamMembersPage = () => {
  const { workspaceSlug } = useParams<{ workspaceSlug: string }>();
  const { user, can } = usePermissions();

  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [workspaceOwnerId, setWorkspaceOwnerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [changingRole, setChangingRole] = useState<string | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);

  const canManage = can('users:write');
  const canViewInvitations = can('users:read');

  const fetchData = useCallback(async () => {
    if (!workspaceSlug) return;
    try {
      setLoading(true);
      setError('');

      const [workspaceRes, rolesRes] = await Promise.all([
        api.get(`/workspaces/${workspaceSlug}`),
        api.get(`/workspaces/${workspaceSlug}/roles`),
      ]);

      setMembers(workspaceRes.data.members || []);
      setWorkspaceOwnerId(workspaceRes.data.owner);
      setRoles(rolesRes.data || []);

      if (canViewInvitations) {
        const invRes = await api.get(`/workspaces/${workspaceSlug}/invitations`);
        setInvitations(invRes.data || []);
      } else {
        setInvitations([]);
      }
    } catch (err) {
      setError(getApiErrorMessage(err, 'We could not load the team. Refresh the page to try again.'));
    } finally {
      setLoading(false);
    }
  }, [workspaceSlug, canViewInvitations]);

  useEffect(() => {
    (async () => {
      await fetchData();
    })();
  }, [fetchData]);

  const handleChangeRole = async (userId: string, roleId: string) => {
    setChangingRole(userId);
    setError('');
    try {
      await api.put(`/workspaces/${workspaceSlug}/members/${userId}/role`, { roleId });
      const role = roles.find((r) => r._id === roleId);
      setMembers((current) =>
        current.map((m) =>
          m.user._id === userId
            ? { ...m, roleId: { _id: roleId, name: role?.name || '', description: role?.description || '' } }
            : m,
        ),
      );
    } catch (err) {
      setError(getApiErrorMessage(err, 'We could not change the role. Try again.'));
    } finally {
      setChangingRole(null);
    }
  };

  const handleConfirm = async () => {
    const action = pendingConfirm;
    if (!action) return;
    setPendingConfirm(null);
    setError('');
    try {
      if (action.kind === 'member') {
        await api.delete(`/workspaces/${workspaceSlug}/members/${action.id}`);
        setMembers((current) => current.filter((m) => m.user._id !== action.id));
      } else {
        await api.delete(`/workspaces/${workspaceSlug}/invitations/${action.id}`);
        setInvitations((current) => current.filter((i) => i._id !== action.id));
      }
    } catch (err) {
      setError(
        getApiErrorMessage(
          err,
          action.kind === 'member' ? 'We could not remove the member. Try again.' : 'We could not cancel the invitation. Try again.',
        ),
      );
    }
  };

  if (!user) return null;

  return (
    <>
      <PageHeader
        title="Team"
        description="Manage who has access to this workspace and their roles."
        actions={
          canManage && (
            <Button
              onClick={() => setInviteOpen(true)}
              className="h-10 gap-2 rounded-lg bg-primary px-5 text-white shadow-sm hover:bg-primary-hover sm:h-9"
            >
              <UserPlus aria-hidden /> Invite member
            </Button>
          )
        }
      />

      {error && <Alert tone="error" onDismiss={() => setError('')}>{error}</Alert>}

      {/* Members */}
      <Surface as="section" aria-labelledby="members-heading" padding="none" className="overflow-hidden">
        <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/60 px-4 py-3 sm:px-6">
          <Users className="size-4 text-slate-500" aria-hidden />
          <h2 id="members-heading" className="text-sm font-semibold text-slate-800">
            Members <span className="font-normal tabular-nums text-slate-600">({members.length})</span>
          </h2>
        </div>

        {loading ? (
          <MembersSkeleton />
        ) : members.length === 0 ? (
          <EmptyState
            icon={<Users />}
            title="No members yet"
            description={canManage ? 'Invite your first teammate to get started.' : 'There are no team members to show.'}
            className="py-12 sm:py-12"
            action={
              canManage && (
                <Button onClick={() => setInviteOpen(true)} className="h-10 gap-2 rounded-lg bg-primary text-white hover:bg-primary-hover">
                  <UserPlus aria-hidden /> Invite member
                </Button>
              )
            }
          />
        ) : (
          <div role="region" aria-label="Members list" tabIndex={0} className={LIST_SCROLL}>
          <ul className="divide-y divide-slate-100">
            {members.map((member) => {
              const isSelf = member.user._id === user._id;
              const isOwner = workspaceOwnerId === member.user._id;
              const canEdit = canManage && !isSelf && !isOwner;

              return (
                // Stacked card on phones; one row from sm
                <li
                  key={member.user._id}
                  className="flex flex-col gap-3 px-4 py-4 transition-colors hover:bg-slate-50/60 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-6"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <UserAvatar name={member.user.name} />
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium text-slate-900">
                        <span className="truncate">{member.user.name}</span>
                        {isSelf && <Tag size="sm">You</Tag>}
                        {isOwner && <Tag size="sm" tone="warning">Owner</Tag>}
                      </p>
                      <p className="truncate text-xs text-slate-600">{member.user.email}</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 pl-12 sm:shrink-0 sm:justify-end sm:pl-0">
                    <RoleControl
                      member={member}
                      roles={roles}
                      editable={canEdit}
                      saving={changingRole === member.user._id}
                      onChange={(roleId) => handleChangeRole(member.user._id, roleId)}
                    />
                    {canEdit && (
                      <Button
                        variant="ghost"
                        onClick={() => setPendingConfirm({ kind: 'member', id: member.user._id, name: member.user.name })}
                        aria-label={`Remove ${member.user.name} from this workspace`}
                        className="size-10 rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-600 md:size-8"
                      >
                        <Trash2 aria-hidden />
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          </div>
        )}
      </Surface>

      {/* Pending invitations */}
      {canViewInvitations && invitations.length > 0 && (
        <Surface as="section" aria-labelledby="invitations-heading" padding="none" className="overflow-hidden">
          <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/60 px-4 py-3 sm:px-6">
            <Clock className="size-4 text-amber-600" aria-hidden />
            <h2 id="invitations-heading" className="text-sm font-semibold text-slate-800">
              Pending invitations <span className="font-normal tabular-nums text-slate-600">({invitations.length})</span>
            </h2>
          </div>
          <div role="region" aria-label="Pending invitations list" tabIndex={0} className={LIST_SCROLL}>
          <ul className="divide-y divide-slate-100">
            {invitations.map((inv) => (
              <li key={inv._id} className="flex items-center justify-between gap-3 px-4 py-4 hover:bg-slate-50/60 sm:px-6">
                <div className="flex min-w-0 items-center gap-3">
                  <IconTile tone="warning">
                    <Mail />
                  </IconTile>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">{inv.email}</p>
                    <p className="text-xs text-slate-600">
                      As {inv.roleId?.name} · Expires {formatDate(inv.expiresAt)}
                    </p>
                  </div>
                </div>
                {canManage && (
                  <Button
                    variant="ghost"
                    onClick={() => setPendingConfirm({ kind: 'invitation', id: inv._id, email: inv.email })}
                    aria-label={`Cancel invitation for ${inv.email}`}
                    className="size-10 shrink-0 rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-600 md:size-8"
                  >
                    <X aria-hidden />
                  </Button>
                )}
              </li>
            ))}
          </ul>
          </div>
        </Surface>
      )}

      <InviteMemberModal
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        workspaceSlug={workspaceSlug!}
        onInvited={fetchData}
      />

      <ConfirmActionDialog
        open={pendingConfirm !== null}
        onOpenChange={(open) => !open && setPendingConfirm(null)}
        title={pendingConfirm?.kind === 'member' ? 'Remove this member?' : 'Cancel this invitation?'}
        description={
          pendingConfirm?.kind === 'member'
            ? `${pendingConfirm.name} loses access to this workspace immediately. You can invite them again later.`
            : pendingConfirm
              ? `The invitation sent to ${pendingConfirm.email} stops working.`
              : ''
        }
        confirmLabel={pendingConfirm?.kind === 'member' ? 'Remove member' : 'Cancel invitation'}
        onConfirm={handleConfirm}
      />
    </>
  );
};

export default TeamMembersPage;
