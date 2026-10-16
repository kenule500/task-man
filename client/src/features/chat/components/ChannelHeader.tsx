import { useId, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Archive, ChevronLeft, FolderKanban, Hash, Lock, MoreHorizontal, Pencil } from 'lucide-react';
import ConfirmActionDialog from '@/components/ConfirmActionDialog';
import FormDialog from '@/components/FormDialog';
import { Field, toast } from '@/components/ds';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { getApiErrorMessage } from '@/utils/api';
import { dmPartner } from '../lib/channels';
import { MAX_CHANNEL_NAME } from '../lib/limits';
import type { ChatChannel, ConnectionStatus } from '../types';
import ConnectionBadge from './ConnectionBadge';
import OnlineDot from './OnlineDot';
import ChatAvatar from './ChatAvatar';

interface ChannelHeaderProps {
  channel: ChatChannel;
  label: string;
  selfId: string;
  /** People in the channel (the whole workspace for public channels) */
  memberIds: string[];
  online: string[];
  connection: ConnectionStatus;
  backHref: string;
  canManage: boolean;
  onRename: (name: string) => Promise<void>;
  onArchive: () => Promise<void>;
}

const ChannelHeader = ({
  channel, label, selfId, memberIds, online, connection, backHref, canManage, onRename, onArchive,
}: ChannelHeaderProps) => {
  const { t } = useTranslation('chat');
  const id = useId();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(channel.name);
  const [renameError, setRenameError] = useState('');
  const [saving, setSaving] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [busy, setBusy] = useState(false);

  const onlineSet = new Set(online);
  const onlineCount = memberIds.filter(memberId => onlineSet.has(memberId)).length;
  const partner = channel.type === 'dm' ? dmPartner(channel, selfId) : null;
  const partnerOnline = partner ? onlineSet.has(partner._id) : false;

  const submitRename = async (event: FormEvent) => {
    event.preventDefault();
    const next = name.trim();
    if (!next) {
      setRenameError(t('newChannel.nameRequired'));
      return;
    }
    setSaving(true);
    setRenameError('');
    try {
      await onRename(next);
      setRenaming(false);
    } catch (error) {
      setRenameError(getApiErrorMessage(error, t('channel.renameFailed')));
    } finally {
      setSaving(false);
    }
  };

  const archive = async () => {
    setBusy(true);
    try {
      await onArchive();
      setArchiving(false);
    } catch (error) {
      toast.error(getApiErrorMessage(error, t('channel.archiveFailed')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <header className="flex min-h-14 shrink-0 items-center gap-2 border-b border-slate-200 px-2 sm:px-4">
      <Link
        to={backHref}
        aria-label={t('header.back')}
        className="flex size-10 shrink-0 items-center justify-center rounded-lg text-slate-600 outline-none hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-primary md:hidden"
      >
        <ChevronLeft className="size-5 rtl:-scale-x-100" aria-hidden />
      </Link>

      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        {partner ? (
          <span className="relative shrink-0">
            <ChatAvatar name={partner.name} src={partner.avatarUrl} size="sm" />
            <OnlineDot online={partnerOnline} className="absolute -bottom-0.5 -end-0.5" />
          </span>
        ) : (
          <span aria-hidden className="shrink-0 text-slate-500">
            {channel.type === 'project' ? <FolderKanban className="size-5" /> : channel.private ? <Lock className="size-5" /> : <Hash className="size-5" />}
          </span>
        )}
        <div className="min-w-0">
          <h2 className="truncate text-base font-bold leading-tight text-slate-900">{label}</h2>
          <p className="truncate text-xs text-slate-600">
            {partner
              ? (partnerOnline ? t('presence.online') : t('presence.offline'))
              : `${t('header.members', { members: memberIds.length })} · ${t('header.onlineCount', { online: onlineCount })}`}
            {channel.private && channel.type !== 'dm' && ` · ${t('channel.private')}`}
          </p>
        </div>
      </div>

      <ConnectionBadge status={connection} className="hidden shrink-0 sm:inline-flex" />

      {canManage && (
        <>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button type="button" variant="ghost" size="icon" aria-label={t('channel.actions')} />}>
              <MoreHorizontal aria-hidden />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => { setName(channel.name); setRenaming(true); }}>
                <Pencil aria-hidden /> {t('channel.rename')}
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onClick={() => setArchiving(true)}>
                <Archive aria-hidden /> {t('channel.archive')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <FormDialog
            open={renaming}
            onOpenChange={setRenaming}
            icon={<Pencil />}
            title={t('channel.renameTitle')}
            description={t('channel.renameDescription')}
            onSubmit={event => { void submitRename(event); }}
            submitLabel={t('messages.save')}
            submittingLabel={t('messages.saving')}
            submitting={saving}
            submitDisabled={!name.trim()}
            error={renameError}
          >
            <Field label={t('newChannel.nameLabel')} htmlFor={`${id}-name`} required>
              <Input id={`${id}-name`} value={name} maxLength={MAX_CHANNEL_NAME} autoComplete="off" onChange={event => setName(event.target.value)} />
            </Field>
          </FormDialog>

          <ConfirmActionDialog
            open={archiving}
            onOpenChange={setArchiving}
            title={t('channel.archiveTitle', { name: label })}
            description={t('channel.archiveDescription')}
            confirmLabel={t('channel.archive')}
            busyLabel={t('channel.archiving')}
            busy={busy}
            onConfirm={() => void archive()}
          />
        </>
      )}
    </header>
  );
};

export default ChannelHeader;
