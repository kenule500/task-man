import { useRef, useState } from 'react';
import { toast } from '@/components/ds';
import { getApiErrorMessage } from '@/utils/api';
import { cn } from '@/lib/utils';
import { chatApi } from '../api';
import { avatarSrc } from '../lib/avatar';
import type { TeamChannelSummary } from '../types';

interface ChannelSettingsDialogProps {
  slug: string;
  team: TeamChannelSummary;
  onClose: () => void;
  onSaved: (summary: { _id: string; name: string; avatarUrl: string | null }) => void;
}

/**
 * Rename and re-picture a team channel. Rendered only for callers holding chat:moderate — the API
 * refuses everyone else, so this is convenience, not the security boundary.
 */
export const ChannelSettingsDialog = ({ slug, team, onClose, onSaved }: ChannelSettingsDialogProps) => {
  const [name, setName] = useState(team.name);
  const [avatar, setAvatar] = useState<string | null>(team.avatarUrl);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const save = async () => {
    const next = name.trim();
    if (!next) return;
    setSaving(true);
    try {
      const summary = await chatApi.renameChannel(slug, team._id, next);
      onSaved(summary);
      toast.success('Channel renamed');
      onClose();
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Could not rename the channel.'));
    } finally {
      setSaving(false);
    }
  };

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const summary = await chatApi.uploadAvatar(slug, team._id, file);
      setAvatar(summary.avatarUrl);
      onSaved(summary);
      toast.success('Avatar updated');
    } catch (error) {
      // The API keeps the previous avatar when an upload is rejected (spec AC-047)
      toast.error(getApiErrorMessage(error, 'Could not update the avatar.'));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="channel-settings-title"
        className="w-full max-w-sm rounded-xl bg-white p-4 shadow-xl"
        onKeyDown={event => {
          if (event.key === 'Escape') onClose();
        }}
      >
        <h2 id="channel-settings-title" className="text-sm font-semibold text-slate-900">
          Channel settings
        </h2>
        <p className="mt-0.5 text-xs text-slate-500">Only the Product Owner can change these.</p>

        <div className="mt-4 flex items-center gap-3">
          <span
            aria-hidden
            className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-sm font-semibold text-slate-600"
          >
            {avatarSrc(avatar)
              ? <img src={avatarSrc(avatar)} alt="" className="size-full object-cover" />
              : team.name.slice(0, 1).toUpperCase()}
          </span>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={event => {
              const file = event.target.files?.[0];
              if (file) void upload(file);
            }}
          />
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
            className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 outline-none hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-60"
          >
            {uploading ? 'Uploading…' : 'Change photo'}
          </button>
        </div>

        <label htmlFor="channel-name" className="mt-4 block text-xs font-medium text-slate-700">
          Channel name
        </label>
        <input
          id="channel-name"
          value={name}
          autoFocus
          maxLength={60}
          onChange={event => setName(event.target.value)}
          className={cn(
            'mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm outline-none',
            'focus-visible:outline-2 focus-visible:outline-primary',
          )}
        />

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 outline-none hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-primary"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving || !name.trim()}
            onClick={() => void save()}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-white outline-none hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChannelSettingsDialog;
