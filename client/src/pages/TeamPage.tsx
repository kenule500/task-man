import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { AlertCircle, Check, Link2, Users, X } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import { Button } from '@/components/ui/button';
import { useAuthGuard } from '@/hooks/useAuthGuard';
import {
  ROLE_LABELS, buildInviteLink, formatJoinedDate, getInitials, useWorkspaceData,
  type WorkspaceMember, type WorkspaceRole,
} from '@/features/workspace';

const ROLE_STYLES: Record<WorkspaceRole, string> = {
  owner: 'bg-blue-50 text-blue-700',
  admin: 'bg-slate-900 text-white',
  member: 'bg-slate-100 text-slate-700',
};

const GRID = 'grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_96px] md:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_96px_120px] gap-4 items-center px-5';

const MemberRow = ({ member }: { member: WorkspaceMember }) => (
  <li className={`${GRID} py-3`}>
    <div className="flex items-center gap-3 min-w-0">
      {member.avatarUrl ? (
        <img src={member.avatarUrl} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
      ) : (
        <span aria-hidden="true" className="w-9 h-9 rounded-full bg-primary/10 text-primary text-xs font-semibold flex items-center justify-center flex-shrink-0">
          {getInitials(member.name)}
        </span>
      )}
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-900 truncate">{member.name}</p>
        <p className="text-xs text-slate-500 truncate">{member.email}</p>
      </div>
    </div>
    <p className="text-sm text-slate-700 truncate">{member.jobTitle || <span className="text-slate-400">No job title</span>}</p>
    <span className={`justify-self-start inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${ROLE_STYLES[member.role]}`}>
      {ROLE_LABELS[member.role]}
    </span>
    <p className="hidden md:block text-sm text-slate-500 tabular-nums">{formatJoinedDate(member.joinedAt)}</p>
  </li>
);

const TeamPage = () => {
  const { user, logout } = useAuthGuard();
  const { workspaceSlug } = useParams<{ workspaceSlug: string }>();
  const { workspace, members, loading, error, clearError } = useWorkspaceData(workspaceSlug);
  const [copied, setCopied] = useState(false);

  const handleCopyInvite = async () => {
    if (!workspace?.inviteCode) return;
    try {
      await navigator.clipboard.writeText(buildInviteLink(window.location.origin, workspace.inviteCode));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  if (!user) return null;

  return (
    <Sidebar user={user} onLogout={logout}>
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Team Members</h1>
          <p className="text-slate-500 text-sm mt-1">
            {workspace ? `People who have access to ${workspace.name}` : 'People who have access to this workspace'}
          </p>
        </header>

        {loading ? (
          <div className="space-y-6" aria-busy="true" aria-label="Loading team">
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 animate-pulse">
              <div className="h-4 w-48 bg-slate-200 rounded mb-3"></div>
              <div className="h-3 w-72 bg-slate-200 rounded"></div>
            </div>
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm divide-y divide-slate-100 animate-pulse">
              {[1, 2, 3].map(i => (
                <div key={i} className="flex items-center gap-3 px-5 py-4">
                  <div className="w-9 h-9 rounded-full bg-slate-200"></div>
                  <div className="space-y-2">
                    <div className="h-3 w-32 bg-slate-200 rounded"></div>
                    <div className="h-3 w-44 bg-slate-200 rounded"></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <>
            {error && (
              <div role="alert" className="flex items-start justify-between gap-3 p-3 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg">
                <span className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  {error}
                </span>
                <button type="button" onClick={clearError} aria-label="Dismiss" className="text-red-400 hover:text-red-600">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {workspace?.inviteCode && (
              <section aria-labelledby="invite-heading" className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-5">
                  <div className="min-w-0">
                    <h2 id="invite-heading" className="font-semibold text-slate-900 text-sm mb-1">
                      Invite teammates to this workspace
                    </h2>
                    <p className="text-xs text-slate-500">
                      Share the invite link or code. Anyone who opens it can join instantly.
                    </p>
                  </div>
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-shrink-0">
                    <code className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-sm font-mono font-semibold tracking-wider text-slate-700 text-center">
                      {workspace.inviteCode}
                    </code>
                    <Button
                      type="button"
                      onClick={handleCopyInvite}
                      className="h-9 rounded-lg gap-2 bg-primary hover:bg-primary-hover text-white text-sm shadow-sm"
                    >
                      {copied ? <Check className="w-4 h-4" /> : <Link2 className="w-4 h-4" />}
                      {copied ? 'Copied' : 'Copy invite link'}
                    </Button>
                  </div>
                </div>
                <p role="status" className="sr-only">{copied ? 'Invite link copied to clipboard' : ''}</p>
              </section>
            )}

            {members.length === 0 ? (
              !error && (
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-10 text-center">
                  <Users className="w-8 h-8 text-slate-300 mx-auto mb-3" aria-hidden="true" />
                  <p className="text-sm font-medium text-slate-900">No members yet</p>
                  <p className="text-sm text-slate-500 mt-1">Share the invite link above to add your first teammate.</p>
                </div>
              )
            ) : (
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <div className={`${GRID} py-3 border-b border-slate-100 text-xs font-semibold uppercase tracking-wide text-slate-500`}>
                  <span>Member</span>
                  <span>Job title</span>
                  <span>Role</span>
                  <span className="hidden md:block">Joined</span>
                </div>
                <ul className="divide-y divide-slate-100">
                  {members.map(member => <MemberRow key={member._id} member={member} />)}
                </ul>
                <p className="px-5 py-3 border-t border-slate-100 text-xs text-slate-500 tabular-nums">
                  {members.length} {members.length === 1 ? 'member' : 'members'}
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </Sidebar>
  );
};

export default TeamPage;
