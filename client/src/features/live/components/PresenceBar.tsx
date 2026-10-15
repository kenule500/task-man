import { UserAvatar } from '@/components/ds';
import { useTaskPresence } from '../hooks/useTaskPresence';

const MAX_SHOWN = 4;

interface PresenceBarProps {
  slug: string | undefined;
  taskId: string;
}

/** "Also viewing" avatars for the people who have this task open right now. Renders nothing when it is only you. */
const PresenceBar = ({ slug, taskId }: PresenceBarProps) => {
  const viewers = useTaskPresence(slug, taskId);
  if (viewers.length === 0) return null;

  const shown = viewers.slice(0, MAX_SHOWN);
  const extra = viewers.length - shown.length;

  return (
    <div className="flex items-center gap-2 text-xs text-slate-500" aria-label={`Also viewing: ${viewers.map(viewer => viewer.name).join(', ')}`} role="group">
      <span aria-hidden>Also viewing</span>
      <span className="flex items-center -space-x-1.5">
        {shown.map(viewer => (
          <span key={viewer._id} title={viewer.name}>
            <UserAvatar name={viewer.name} src={viewer.avatarUrl} size="sm" className="size-6 ring-2 ring-white" />
          </span>
        ))}
        {extra > 0 && (
          <span aria-hidden className="flex size-6 items-center justify-center rounded-full bg-surface-sunken text-[11px] font-semibold tabular-nums text-text-body ring-2 ring-white">
            +{extra}
          </span>
        )}
      </span>
    </div>
  );
};

export default PresenceBar;
