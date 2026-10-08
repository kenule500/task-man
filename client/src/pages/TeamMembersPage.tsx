import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import InviteMemberModal from '../components/InviteMemberModal';
import { usePermissions } from '../hooks/usePermissions';
import { Button } from '@/components/ui/button';
import api from '../utils/api';
import {
  UserPlus, Mail, Clock, X, Users, Shield, Trash2, ChevronDown,
} from 'lucide-react';

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

const TeamMembersPage = () => {
  const { workspaceSlug } = useParams<{ workspaceSlug: string }>();
  const { user, can } = usePermissions();

  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [workspaceOwnerId, setWorkspaceOwnerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [changingRole, setChangingRole] = useState<string | null>(null);

  const canManage = can('users:write');
  const canViewInvitations = can('users:read');

  const fetchData = useCallback(async () => {
    if (!workspaceSlug) return;
    try {
      setLoading(true);

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
      console.error('Failed to load team:', err);
    } finally {
      setLoading(false);
    }
  }, [workspaceSlug, canViewInvitations]);

  useEffect(() => {
    (async () => {
      await fetchData();
    })();
  }, [fetchData]);

  useEffect(() => {
    const handleClick = () => setOpenMenu(null);
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  const handleChangeRole = async (userId: string, roleId: string) => {
    setChangingRole(userId);
    try {
      await api.put(`/workspaces/${workspaceSlug}/members/${userId}/role`, { roleId });
      const role = roles.find((r) => r._id === roleId);
      setMembers(members.map((m) =>
        m.user._id === userId
          ? {
              ...m,
              roleId: {
                _id: roleId,
                name: role?.name || '',
                description: role?.description || '',
              },
            }
          : m
      ));
    } catch (err: unknown) {
      const axiosError = err as { response?: { data?: { message?: string } } };
      alert(axiosError.response?.data?.message || 'Failed to change role');
    } finally {
      setChangingRole(null);
      setOpenMenu(null);
    }
  };

  const handleRemoveMember = async (userId: string, name: string) => {
    if (!window.confirm(`Remove ${name} from this workspace?`)) return;
    try {
      await api.delete(`/workspaces/${workspaceSlug}/members/${userId}`);
      setMembers(members.filter((m) => m.user._id !== userId));
    } catch (err: unknown) {
      const axiosError = err as { response?: { data?: { message?: string } } };
      alert(axiosError.response?.data?.message || 'Failed to remove member');
    }
  };

  const handleCancelInvite = async (id: string) => {
    if (!window.confirm('Cancel this invitation?')) return;
    try {
      await api.delete(`/workspaces/${workspaceSlug}/invitations/${id}`);
      setInvitations(invitations.filter((i) => i._id !== id));
    } catch {
      alert('Failed to cancel invitation');
    }
  };

  if (!user) return null;

  return (
    <div className="w-full space-y-6">

      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Team Members
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Manage who has access to this workspace and their roles.
          </p>
        </div>
        {canManage && (
          <Button
            onClick={() => setInviteOpen(true)}
            className="rounded-lg gap-2 bg-primary hover:bg-primary-hover text-white h-10 px-5"
          >
            <UserPlus className="w-4 h-4" /> Invite Member
          </Button>
        )}
      </header>

      {/* Members list */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-visible">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
          <Users className="w-4 h-4 text-slate-500" />
          <h2 className="text-sm font-semibold text-slate-700">
            Members ({members.length})
          </h2>
        </div>

        {loading ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3 animate-pulse">
                <div className="w-10 h-10 bg-slate-200 rounded-full" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-40 bg-slate-200 rounded" />
                  <div className="h-3 w-56 bg-slate-100 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : members.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-400">
              <Users className="w-8 h-8" />
            </div>
            <h3 className="text-base font-semibold text-slate-700 mb-1">
              No members yet
            </h3>
            <p className="text-sm text-slate-500">
              {canManage
                ? 'Invite your first teammate to get started.'
                : 'No team members to display.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {members.map((member) => {
              const isSelf = member.user._id === user._id;
              const isOwner = workspaceOwnerId === member.user._id;
              const canEdit = canManage && !isSelf && !isOwner;

              return (
                <div
                  key={member.user._id}
                  className="px-6 py-4 flex items-center justify-between hover:bg-slate-50/50 transition-colors gap-4"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="w-10 h-10 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center flex-shrink-0">
                      {member.user.name?.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-slate-900 text-sm truncate flex items-center gap-2">
                        {member.user.name}
                        {isSelf && (
                          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                            You
                          </span>
                        )}
                        {isOwner && (
                          <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                            Owner
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-slate-500 truncate">
                        {member.user.email}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    {!canEdit && (
                      <div className="hidden sm:flex items-center gap-1.5 bg-slate-100 border border-slate-200 rounded-lg px-2.5 py-1">
                        <Shield className="w-3 h-3 text-slate-500" />
                        <span className="text-xs font-medium text-slate-700">
                          {member.roleId?.name || 'No role'}
                        </span>
                      </div>
                    )}

                    {canEdit && (
                      <div
                        className="relative"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          onClick={() =>
                            setOpenMenu(
                              openMenu === member.user._id ? null : member.user._id
                            )
                          }
                          disabled={changingRole === member.user._id}
                          className="flex items-center gap-1.5 bg-white border border-slate-200 hover:border-slate-300 rounded-lg px-2.5 py-1.5 transition-colors disabled:opacity-50"
                        >
                          <Shield className="w-3 h-3 text-slate-500" />
                          <span className="text-xs font-medium text-slate-700">
                            {changingRole === member.user._id
                              ? 'Saving...'
                              : member.roleId?.name || 'No role'}
                          </span>
                          <ChevronDown className="w-3 h-3 text-slate-400" />
                        </button>

                        {openMenu === member.user._id && (
                          <div className="absolute right-0 top-full mt-1 w-56 bg-white rounded-lg border border-slate-200 shadow-lg py-1 z-50">
                            <div className="px-3 py-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                              Change role
                            </div>
                            <div className="h-px bg-slate-100 mx-1" />
                            {roles.map((role) => (
                              <button
                                key={role._id}
                                onClick={() =>
                                  handleChangeRole(member.user._id, role._id)
                                }
                                className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex items-center justify-between gap-2 ${
                                  member.roleId?._id === role._id
                                    ? 'text-primary font-medium'
                                    : 'text-slate-700'
                                }`}
                              >
                                <span className="truncate">{role.name}</span>
                                {member.roleId?._id === role._id && (
                                  <div className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
                                )}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {canEdit && (
                      <button
                        onClick={() =>
                          handleRemoveMember(member.user._id, member.user.name)
                        }
                        className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                        title="Remove member"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Pending invitations */}
      {canViewInvitations && invitations.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-500" />
            <h2 className="text-sm font-semibold text-slate-700">
              Pending Invitations ({invitations.length})
            </h2>
          </div>
          <div className="divide-y divide-slate-100">
            {invitations.map((inv) => (
              <div
                key={inv._id}
                className="px-6 py-4 flex items-center justify-between hover:bg-slate-50/50"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center flex-shrink-0">
                    <Mail className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900 text-sm truncate">
                      {inv.email}
                    </p>
                    <p className="text-xs text-slate-500">
                      As {inv.roleId?.name} • Expires{' '}
                      {new Date(inv.expiresAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                {canManage && (
                  <button
                    onClick={() => handleCancelInvite(inv._id)}
                    className="text-slate-400 hover:text-red-600 transition-colors p-1"
                    title="Cancel invitation"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <InviteMemberModal
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        workspaceSlug={workspaceSlug!}
        onInvited={fetchData}
      />
    </div>
  );
};

export default TeamMembersPage;