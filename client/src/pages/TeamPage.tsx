import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Check, Link2, Users } from 'lucide-react';
import AppShell from '@/components/AppShell';
import { Alert, EmptyState, PageHeader, SectionHeader, Surface, Tag, UserAvatar } from '@/components/ds';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import {
  ROLE_LABELS, buildInviteLink, formatJoinedDate, useWorkspaceData,
  type WorkspaceMember, type WorkspaceRole,
} from '@/features/workspace';

const ROLE_TONES: Record<WorkspaceRole, 'primary' | 'dark' | 'neutral'> = {
  owner: 'primary',
  admin: 'dark',
  member: 'neutral',
};

// Table on md and up; below md each member is a stacked card row.
const GRID = 'md:grid md:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_96px_120px] md:items-center md:gap-4 px-4 md:px-5';

const MemberRow = ({ member }: { member: WorkspaceMember }) => (
  <li className={`${GRID} py-3`}>
    <div className="flex items-center gap-3 min-w-0">
      <UserAvatar name={member.name} src={member.avatarUrl || undefined} />
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-900 truncate">{member.name}</p>
        <p className="text-xs text-slate-500 truncate">{member.email}</p>
      </div>
    </div>
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 pl-12 md:contents">
      <p className="min-w-0 truncate text-sm text-slate-700">
        {member.jobTitle || <span className="text-slate-400">No job title</span>}
      </p>
      <Tag tone={ROLE_TONES[member.role]} className="justify-self-start">{ROLE_LABELS[member.role]}</Tag>
      <p className="text-xs text-slate-500 tabular-nums md:text-sm">
        <span className="md:sr-only">Joined </span>
        {formatJoinedDate(member.joinedAt)}
      </p>
    </div>
  </li>
);

const TeamPage = () => {
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

  return (
    <AppShell>
      <PageHeader
        title="Team Members"
        description={workspace ? `People who have access to ${workspace.name}` : 'People who have access to this workspace'}
      />

      {loading ? (
        <div className="space-y-6" aria-busy="true" aria-label="Loading team">
          <Surface className="space-y-3">
            <Skeleton className="h-4 w-48 bg-slate-200" />
            <Skeleton className="h-3 w-full max-w-72 bg-slate-200" />
          </Surface>
          <Surface padding="none" className="divide-y divide-slate-100">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex items-center gap-3 px-5 py-4">
                <Skeleton className="size-9 rounded-full bg-slate-200" />
                <div className="space-y-2">
                  <Skeleton className="h-3 w-32 bg-slate-200" />
                  <Skeleton className="h-3 w-44 bg-slate-200" />
                </div>
              </div>
            ))}
          </Surface>
        </div>
      ) : (
        <>
          {error && <Alert tone="error" onDismiss={clearError}>{error}</Alert>}

          {workspace?.inviteCode && (
            <Surface as="section" aria-labelledby="invite-heading" className="sm:p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:gap-5">
                <div className="min-w-0">
                  <SectionHeader className="mb-1" title={<span id="invite-heading">Invite teammates to this workspace</span>} />
                  <p className="text-xs text-slate-500">
                    Share the invite link or code. Anyone who opens it can join instantly.
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-stretch gap-3 sm:flex-row sm:items-center">
                  <code className="break-all rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-center text-sm font-mono font-semibold tracking-wider text-slate-700">
                    {workspace.inviteCode}
                  </code>
                  <Button
                    type="button"
                    onClick={handleCopyInvite}
                    className="h-10 gap-2 rounded-lg bg-primary text-sm text-white shadow-sm hover:bg-primary-hover sm:h-9"
                  >
                    {copied ? <Check className="w-4 h-4" /> : <Link2 className="w-4 h-4" />}
                    {copied ? 'Copied' : 'Copy invite link'}
                  </Button>
                </div>
              </div>
              <p role="status" className="sr-only">{copied ? 'Invite link copied to clipboard' : ''}</p>
            </Surface>
          )}

          {members.length === 0 ? (
            !error && (
              <Surface padding="none">
                <EmptyState
                  icon={<Users />}
                  title="No members yet"
                  description="Share the invite link above to add your first teammate."
                  className="py-10 sm:py-10"
                />
              </Surface>
            )
          ) : (
            <Surface padding="none" className="overflow-hidden">
              <div className={`${GRID} hidden py-3 border-b border-slate-100 text-xs font-semibold uppercase tracking-wide text-slate-500`}>
                <span>Member</span>
                <span>Job title</span>
                <span>Role</span>
                <span>Joined</span>
              </div>
              <ul className="divide-y divide-slate-100">
                {members.map(member => <MemberRow key={member._id} member={member} />)}
              </ul>
              <p className="px-4 py-3 md:px-5 border-t border-slate-100 text-xs text-slate-500 tabular-nums">
                {members.length} {members.length === 1 ? 'member' : 'members'}
              </p>
            </Surface>
          )}
        </>
      )}
    </AppShell>
  );
};

export default TeamPage;
