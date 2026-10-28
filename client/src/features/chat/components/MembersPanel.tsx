import { useEffect, useState, type RefObject } from 'react';
import { UserAvatar } from '@/components/ds';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { chatApi } from '../api';
import { avatarSrc } from '../lib/avatar';
import { groupMembers } from '../lib/members';
import type { ChannelMember } from '../types';

interface MembersPanelProps {
  slug: string;
  channelId: string;
  /** The channel's title, so the panel header names what the people are members of. */
  channelLabel: string;
  /** The signed-in user, who gets a `You` badge rather than being listed anonymously. */
  currentUserId?: string;
  /** The count the header shows, so the panel and the header cannot disagree before the fetch lands. */
  memberCount?: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * The members control. A ref, not the element, so the panel reads `current` when it closes rather
   * than during render (NFR-033).
   */
  returnFocusTo?: RefObject<HTMLElement | null>;
}

/**
 * Who is in this channel (FR-093, FR-095).
 *
 * The audience is decided by the server from the channel's kind - a project's members, the workspace
 * for the two default channels, or the two participants of a direct conversation (EC-038) - so this
 * component only renders what it is given. Online members come first, the count matches the header,
 * and the sheet is keyboard complete: focus moves inside on open and Escape returns it to the trigger.
 */
export const MembersPanel = ({
  slug, channelId, channelLabel, currentUserId, memberCount, open, onOpenChange, returnFocusTo,
}: MembersPanelProps) => {
  const [members, setMembers] = useState<ChannelMember[]>([]);
  const [count, setCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!open || !slug || !channelId) return undefined;

    let cancelled = false;
    // Raised in the effect body on purpose: the panel is opened by a user action, so this is not a
    // cascading render but the start of an external fetch
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the fetch starts in this effect
    setLoading(true);
    setFailed(false);

    chatApi.channelMembers(slug, channelId)
      .then(payload => {
        if (cancelled) return;
        setMembers(payload.members);
        setCount(payload.count);
      })
      .catch(() => {
        // A failed query degrades to a readable placeholder, never an unhandled rejection (NFR-041)
        if (cancelled) return;
        setMembers([]);
        setCount(null);
        setFailed(true);
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [open, slug, channelId]);

  // While the list is in flight the header's number is used, so the two never disagree on screen
  const total = count ?? memberCount ?? members.length;
  const groups = groupMembers(members);

  const close = () => {
    onOpenChange(false);
    // Base UI restores focus itself, but the trigger is named explicitly so a re-render cannot lose it.
    // `current` is read here, in a handler, never during render.
    requestAnimationFrame(() => returnFocusTo?.current?.focus?.());
  };

  return (
    <Sheet open={open} onOpenChange={next => (next ? onOpenChange(true) : close())}>
      <SheetContent
        side="right"
        className="w-full gap-0 p-0 sm:max-w-sm"
        // The panel is never wider than the screen, so 320px needs no horizontal scrolling (NFR-034)
        aria-label={`Members of ${channelLabel}`}
      >
        <SheetHeader className="border-b border-slate-200 pr-12">
          <SheetTitle>Members</SheetTitle>
          <SheetDescription aria-live="polite">
            {total} {total === 1 ? 'member' : 'members'} in {channelLabel}
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 py-3">
          {loading && members.length === 0 && (
            <p className="py-6 text-center text-sm text-slate-500">Loading members...</p>
          )}

          {failed && (
            <p role="alert" className="py-6 text-center text-sm text-slate-500">
              The member list could not be loaded. Close and reopen the panel to try again.
            </p>
          )}

          {!loading && !failed && members.length === 0 && (
            <p className="py-6 text-center text-sm text-slate-500">No members to show.</p>
          )}

          {groups.map(group => (
            <section key={group.key} className="mb-3 last:mb-0" aria-label={group.label}>
              <h3 className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                {group.label} — {group.members.length}
              </h3>
              <ul>
                {group.members.map(member => {
                  const you = Boolean(currentUserId && member._id === currentUserId);
                  return (
                    <li key={member._id} className="flex items-center gap-2.5 rounded-lg px-1 py-1.5">
                      <span className="relative shrink-0">
                        <UserAvatar name={member.name} src={avatarSrc(member.avatarUrl)} size="sm" />
                        <span
                          aria-hidden
                          className={cn(
                            'absolute -bottom-0.5 -right-0.5 size-2 rounded-full ring-2 ring-white',
                            member.online ? 'bg-success-fg' : 'bg-slate-300',
                          )}
                        />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate text-sm font-medium text-slate-900">{member.name}</span>
                          {you && (
                            <span className="shrink-0 rounded bg-primary/10 px-1 text-[10px] font-semibold text-primary">
                              You
                            </span>
                          )}
                        </span>
                        <span className="block truncate text-xs text-slate-500">
                          {/* Presence is stated in text, not only by the dot's colour */}
                          {member.online ? 'Online' : 'Offline'}
                          {member.roleName && ` · ${member.roleName}`}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default MembersPanel;
