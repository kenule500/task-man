import { Loader2, Monitor, Smartphone, Tablet, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tag } from '@/components/ds';
import type { AccountSession } from '../types';
import { deviceLabel, describeUserAgent, formatRelativeTime, type DeviceKind } from '../lib/userAgent';

const ICONS: Record<DeviceKind, LucideIcon> = { desktop: Monitor, mobile: Smartphone, tablet: Tablet };

interface SessionListProps {
  sessions: AccountSession[];
  /** Id of the session being signed out (disables its button). */
  busyId?: string | null;
  onSignOut: (session: AccountSession) => void;
  now?: Date;
}

/** Accessible list of signed-in devices; the current one is shown first with a tag. */
export const SessionList = ({ sessions, busyId = null, onSignOut, now }: SessionListProps) => {
  const ordered = [...sessions].sort((a, b) => Number(b.current) - Number(a.current));

  return (
    <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200">
      {ordered.map((session) => {
        const label = deviceLabel(session.userAgent);
        const Icon = ICONS[describeUserAgent(session.userAgent).device];
        const when = session.lastLoggedIn ?? session.createdAt;
        const absolute = new Date(when);
        const busy = busyId === session._id;
        return (
          <li key={session._id} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:gap-4 sm:p-4">
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <span aria-hidden className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                <Icon className="size-5" />
              </span>
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-900">
                  <span className="break-words">{label}</span>
                  {session.current && <Tag tone="success" size="sm">This device</Tag>}
                </p>
                <p className="mt-0.5 break-words text-xs text-slate-600">
                  {session.ipAddress || 'IP unknown'}
                  <span aria-hidden> · </span>
                  <span title={Number.isNaN(absolute.getTime()) ? undefined : absolute.toLocaleString()}>
                    Signed in {formatRelativeTime(when, now) || 'at an unknown time'}
                  </span>
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => onSignOut(session)}
              aria-label={`Sign out ${label}`}
              className="h-11 w-full gap-2 sm:h-9 sm:w-auto"
            >
              {busy && <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden />}
              Sign out
            </Button>
          </li>
        );
      })}
    </ul>
  );
};
