import { useState } from 'react';
import { Hash, Lock, Settings2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { UserAvatar } from '@/components/ds';
import { avatarSrc } from '../lib/avatar';
import type { TeamChannelSummary } from '../types';

interface TeamChannelListProps {
  slug: string;
  teams: TeamChannelSummary[];
  currentChannelId: string | undefined;
  loading: boolean;
  canManage: boolean;
  onSelect: (channelId: string) => void;
  onOpenSettings: (team: TeamChannelSummary) => void;
  className?: string;
}

const previewOf = (team: TeamChannelSummary): string => {
  if (!team.lastMessage) return 'No messages yet';
  const author = team.lastMessage.authorName ? `${team.lastMessage.authorName}: ` : '';
  const body = team.lastMessage.body || 'Attachment';
  return `${author}${body}`.slice(0, 80);
};

/**
 * Team channels as a group-chat inbox beside the conversation:
 * avatar, name, last-message preview and an unread dot.
 */
export const TeamChannelList = ({
  slug, teams, currentChannelId, loading, canManage, onSelect, onOpenSettings, className,
}: TeamChannelListProps) => {
  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <nav aria-label="Team channels" className={cn('flex flex-col', className)}>
      <h2 className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        Team channels
      </h2>

      {loading && <p className="px-3 py-2 text-xs text-slate-500">Loading team channels…</p>}

      {!loading && teams.length === 0 && (
        <p className="px-3 py-2 text-xs text-slate-500">
          You are not on any project yet. Assign yourself a task in a project to join its channel.
        </p>
      )}

      <ul className="min-h-0 flex-1 overflow-y-auto">
        {teams.map(team => {
          const active = team._id === currentChannelId;
          return (
            <li key={team._id} className="group relative">
              <button
                type="button"
                onClick={() => onSelect(team._id)}
                onMouseEnter={() => setHovered(team._id)}
                onMouseLeave={() => setHovered(null)}
                onFocus={() => setHovered(team._id)}
                onBlur={() => setHovered(null)}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex w-full items-center gap-2.5 px-3 py-2 text-left outline-none transition-colors',
                  'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary',
                  active ? 'bg-slate-100' : 'hover:bg-slate-50',
                )}
              >
                <UserAvatar name={team.name} src={avatarSrc(team.avatarUrl)} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-1.5">
                    <span className={cn('truncate text-sm', team.unread && !active ? 'font-semibold text-slate-900' : 'text-slate-800')}>
                      {team.name}
                    </span>
                    {team.archived && (
                      <span className="shrink-0 rounded bg-slate-200 px-1 text-[10px] uppercase tracking-wide text-slate-600">
                        Archived
                      </span>
                    )}
                  </span>
                  <span className="flex items-center gap-1 text-xs text-slate-500">
                    <Hash className="size-3 shrink-0" aria-hidden />
                    <span className="truncate">{previewOf(team)}</span>
                  </span>
                </span>
                {team.unread && !active && (
                  <>
                    <span aria-hidden className="size-2 shrink-0 rounded-full bg-primary" />
                    <span className="sr-only">Unread messages</span>
                  </>
                )}
              </button>

              {/* Rename and avatar are offered only to the Product Owner capability */}
              {canManage && hovered === team._id && (
                <button
                  type="button"
                  aria-label={`Settings for ${team.name}`}
                  onClick={event => {
                    event.stopPropagation();
                    onOpenSettings(team);
                  }}
                  className="absolute right-2 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md bg-white/90 text-slate-500 shadow-sm outline-none hover:text-slate-800 focus-visible:outline-2 focus-visible:outline-primary"
                >
                  <Settings2 className="size-3.5" aria-hidden />
                </button>
              )}
            </li>
          );
        })}
      </ul>

      <p className="flex items-center gap-1 px-3 py-2 text-[11px] text-slate-400">
        <Lock className="size-3" aria-hidden />
        <span>Only project members can read a team channel</span>
      </p>
      <span className="sr-only">{slug}</span>
    </nav>
  );
};

export default TeamChannelList;
